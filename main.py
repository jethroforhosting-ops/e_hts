import os
import json
import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_from_directory
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__, 
            template_folder='templates',
            static_folder='static')

app.secret_key = os.environ.get('SECRET_KEY', 'default_fallback_secret_key')

# ==========================================
# PWA ASSET ROUTES
# ==========================================
@app.route('/sw.js')
def serve_sw():
    return send_from_directory(app.static_folder, 'sw.js', mimetype='application/javascript')

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory(app.static_folder, 'manifest.json', mimetype='application/json')

# ==========================================
# LOCAL SQLITE DATABASE INITIALIZATION
# ==========================================
DB_NAME = "hts_offline_queue.db"

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_sqlite_db():
    """Initializes local SQLite database tables for offline queuing."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hts_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uic TEXT UNIQUE,
            assisted_by TEXT,
            payload_json TEXT NOT NULL,
            client_signature TEXT,
            is_synced INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_sqlite_db()

# ==========================================
# FIREBASE ADMIN CONFIGURATION
# ==========================================
try:
    if not firebase_admin._apps:
        cert_path = os.environ.get('FIREBASE_ADMIN_CERT', 'serviceAccountKey.json')
        if os.path.exists(cert_path):
            cred = credentials.Certificate(cert_path)
            firebase_admin.initialize_app(cred)
            db = firestore.client()
        else:
            print(f"WARNING: Firebase service account file '{cert_path}' not found in root directory.")
            db = None
    else:
        db = firestore.client()
except Exception as e:
    print(f"CRITICAL ERROR: Could not initialize Firebase Admin. Error: {e}")
    db = None

FIREBASE_CONFIG = {
    "apiKey": os.environ.get("FIREBASE_API_KEY", "AIzaSyBYc1L6EQ0Kao1BbmBxRG66PNyjX5udI94"),
    "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN", "employee-portal-85b28.firebaseapp.com"),
    "databaseURL": "https://employee-portal-85b28-default-rtdb.firebaseio.com",
    "projectId": os.environ.get("FIREBASE_PROJECT_ID", "employee-portal-85b28"),
    "storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET", "employee-portal-85b28.firebasestorage.app"),
    "messagingSenderId": os.environ.get("FIREBASE_MESSAGING_SENDER_ID", "923148564575"),
    "appId": os.environ.get("FIREBASE_APP_ID", "1:923148564575:web:892d7eba7c9c66387e43ea")
}

# ==========================================
# SQLITE OFFLINE QUEUE API ENDPOINTS
# ==========================================

@app.route('/')
def landing_page():
    """Renders the main choice portal landing page."""
    return render_template('index.html')

@app.route('/api/sqlite/save-offline', methods=['POST'])
def save_to_sqlite():
    payload = request.get_json() or {}
    if not payload:
        return jsonify({"error": "No payload provided"}), 400

    uic = payload.get('uic', '')
    assisted_by = payload.get('assisted_by', 'DIRECT_ENTRY')
    signature = payload.get('client_signature', '')
    payload_json = json.dumps(payload)

    # 1. Try pushing directly to Firestore first
    firestore_synced = False
    if db:
        try:
            db.collection('hts_records').add(payload)
            firestore_synced = True
        except Exception as e:
            print(f"Firestore Save Error: {e}")

    is_synced = 1 if firestore_synced else 0

    # 2. Save to local SQLite database as a backup/record
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO hts_submissions (uic, assisted_by, payload_json, client_signature, is_synced)
            VALUES (?, ?, ?, ?, ?)
        ''', (uic, assisted_by, payload_json, signature, is_synced))
        conn.commit()
        last_id = cursor.lastrowid
        conn.close()
        return jsonify({
            "status": "success", 
            "record_id": f"sqlite_{last_id}",
            "is_synced": is_synced
        }), 200
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"status": "error", "message": "Duplicate UIC entry found."}), 400
    except Exception as e:
        conn.close()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/sqlite/sync-pending', methods=['POST'])
def sync_sqlite_to_firestore():
    """Pushes unsynced records from SQLite into Firebase Firestore when network is available."""
    if not db:
        return jsonify({"error": "Firebase Admin DB connection unavailable"}), 500

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM hts_submissions WHERE is_synced = 0')
    rows = cursor.fetchall()

    synced_ids = []

    for row in rows:
        local_id = row['id']
        payload = json.loads(row['payload_json'])
        payload['synced_at'] = firestore.SERVER_TIMESTAMP

        try:
            doc_ref = db.collection('hts_records').add(payload)
            cursor.execute('UPDATE hts_submissions SET is_synced = 1 WHERE id = ?', (local_id,))
            synced_ids.append(local_id)
        except Exception as e:
            print(f"Error syncing SQLite record #{local_id} to Firestore: {e}")
            break

    conn.commit()
    conn.close()

    return jsonify({
        "status": "success",
        "synced_count": len(synced_ids),
        "synced_local_ids": synced_ids
    }), 200

# ==========================================
# EXPORT MANAGER & RECORDS API (SQLITE + FIRESTORE)
# ==========================================

@app.route('/export-manager')
def export_manager():
    """Renders the Master Checklist Batch Export Dashboard."""
    return render_template('export_manager.html')


@app.route('/api/my-hts-records', methods=['GET'])
def my_hts_records():
    """Fetches records from BOTH local SQLite DB and Firestore."""
    combined_records = []

    # 1. Fetch from Local SQLite DB
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM hts_submissions ORDER BY id DESC')
        sqlite_rows = cursor.fetchall()

        for row in sqlite_rows:
            payload = json.loads(row['payload_json'])
            is_synced = bool(row['is_synced'])
            record_id = f"sqlite_{row['id']}"

            combined_records.append({
                'id': record_id,
                'data': payload,
                'source': 'SQLite Local',
                'is_synced': is_synced
            })
        conn.close()
    except Exception as e:
        print(f"SQLite Fetch Error: {e}")

    # 2. Fetch from Remote Firestore DB
    if db:
        try:
            user_email = session.get('user', '')
            query = db.collection('hts_records')
            if user_email:
                query = query.where(filter=FieldFilter('assisted_by', '==', user_email))
            
            records = query.stream()
            for r in records:
                r_dict = r.to_dict()
                if not any(item['data'].get('uic') == r_dict.get('uic') for item in combined_records):
                    combined_records.append({
                        'id': r.id,
                        'data': r_dict,
                        'source': 'Firestore Cloud',
                        'is_synced': True
                    })
        except Exception as e:
            print(f"Firestore Streaming Error: {e}")

    return jsonify(combined_records), 200


@app.route('/api/records/<record_id>/update-linkage', methods=['POST'])
def update_record_linkage(record_id):
    """Updates linkage_result for a record in SQLite or Firestore."""
    payload = request.get_json() or {}
    linkage_result = payload.get('linkage_result', '')

    if not linkage_result:
        return jsonify({"error": "No result provided"}), 400

    if str(record_id).startswith('sqlite_'):
        clean_id = record_id.replace('sqlite_', '')
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('SELECT payload_json FROM hts_submissions WHERE id = ?', (clean_id,))
            row = cursor.fetchone()
            if row:
                data = json.loads(row['payload_json'])
                data['linkage_result'] = linkage_result
                cursor.execute('UPDATE hts_submissions SET payload_json = ? WHERE id = ?', (json.dumps(data), clean_id))
                conn.commit()
            conn.close()
            return jsonify({"status": "success", "record_id": record_id}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if db:
        try:
            db.collection('hts_records').document(record_id).update({'linkage_result': linkage_result})
            return jsonify({"status": "success", "record_id": record_id}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return jsonify({"error": "Database unavailable"}), 500

@app.route('/api/records/uic/<uic_key>/update-linkage', methods=['POST'])
def update_record_linkage_by_uic(uic_key):
    """Updates linkage_result for a record using UIC as the reference."""
    payload = request.get_json() or {}
    linkage_result = payload.get('linkage_result', '')

    if not linkage_result:
        return jsonify({"error": "No result provided"}), 400

    updated = False

    # 1. Update in Local SQLite DB
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, payload_json FROM hts_submissions WHERE uic = ?', (uic_key,))
        row = cursor.fetchone()
        if row:
            data = json.loads(row['payload_json'])
            data['linkage_result'] = linkage_result
            cursor.execute('UPDATE hts_submissions SET payload_json = ? WHERE id = ?', (json.dumps(data), row['id']))
            conn.commit()
            updated = True
        conn.close()
    except Exception as e:
        print(f"SQLite Linkage Update Error: {e}")

    # 2. Update in Cloud Firestore
    if db:
        try:
            records = db.collection('hts_records').where(filter=FieldFilter('uic', '==', uic_key)).stream()
            for doc in records:
                db.collection('hts_records').document(doc.id).update({'linkage_result': linkage_result})
                updated = True
        except Exception as e:
            print(f"Firestore Linkage Update Error: {e}")

    if updated:
        return jsonify({"status": "success", "uic": uic_key, "linkage_result": linkage_result}), 200
    
    return jsonify({"error": "Record with UIC not found"}), 44

@app.route('/records/<record_id>/export', methods=['GET'])
def export_single_record(record_id):
    """Generates a printable DOH HTS record checklist from SQLite or Firestore."""
    record_data = None

    if str(record_id).startswith('sqlite_'):
        clean_id = record_id.replace('sqlite_', '')
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('SELECT payload_json FROM hts_submissions WHERE id = ?', (clean_id,))
            row = cursor.fetchone()
            conn.close()

            if row:
                record_data = json.loads(row['payload_json'])
                record_data['id'] = record_id
        except Exception as e:
            print(f"SQLite Export Fetch Error: {e}")

    if not record_data and db:
        try:
            doc_ref = db.collection('hts_records').document(record_id).get()
            if doc_ref.exists:
                record_data = doc_ref.to_dict() or {}
                record_data['id'] = doc_ref.id
        except Exception as e:
            print(f"Firestore Export Fetch Error: {e}")

    if not record_data:
        return "Record Not Found in SQLite or Firestore", 404

    for key, value in record_data.items():
        if isinstance(value, datetime) or hasattr(value, 'strftime'):
            record_data[key] = value.strftime('%Y-%m-%d %H:%M:%S')

    staff_nickname = session.get('nickname', record_data.get('service_provider_name', 'COUNSELOR'))
    staff_facility = 'ALTERS CLINICAL HUB'

    return render_template('hts_export_template.html', 
                           records_bundle=[record_data],
                           staff_nickname=staff_nickname,
                           staff_facility=staff_facility)


@app.route('/records/batch/export', methods=['GET'])
def export_batch_records():
    """Generates batch printable checklists for a list of comma-separated IDs (SQLite + Firestore)."""
    raw_ids = request.args.get('ids', '')
    if not raw_ids:
        return "No parameters provided", 400

    id_list = raw_ids.split(',')
    records_bundle = []

    for item_id in id_list:
        clean_id = item_id.strip()
        record_data = None

        if clean_id.startswith('sqlite_'):
            sql_id = clean_id.replace('sqlite_', '')
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute('SELECT payload_json FROM hts_submissions WHERE id = ?', (sql_id,))
                row = cursor.fetchone()
                conn.close()
                if row:
                    record_data = json.loads(row['payload_json'])
                    record_data['id'] = clean_id
            except Exception as e:
                print(f"Batch SQLite Error: {e}")

        elif db:
            try:
                doc_ref = db.collection('hts_records').document(clean_id).get()
                if doc_ref.exists:
                    record_data = doc_ref.to_dict() or {}
                    record_data['id'] = doc_ref.id
            except Exception as e:
                print(f"Batch Firestore Error: {e}")

        if record_data:
            records_bundle.append(record_data)

    staff_nickname = session.get('nickname', 'COUNSELOR')
    staff_facility = 'ALTERS CLINICAL HUB'

    return render_template('hts_export_template.html', 
                           records_bundle=records_bundle,
                           staff_nickname=staff_nickname,
                           staff_facility=staff_facility)


@app.route('/hts-form')
def hts_form():
    """Renders the client intake form with environment configuration."""
    assisted_by = request.args.get('assisted_by', '')
    record_id = request.args.get('record_id', '')
    return render_template('hts_form.html', 
                           assisted_by=assisted_by, 
                           record_id=record_id, 
                           firebase_config=FIREBASE_CONFIG)

@app.route('/healthz')
def health_check():
    return "OK", 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)