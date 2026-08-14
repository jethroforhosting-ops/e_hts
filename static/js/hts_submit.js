document.addEventListener('DOMContentLoaded', () => {

    let currentRecordId = null; 
    let hasSignatureDrawn = false;

    // ==========================================
    // 1. PSGC ADDRESS POPULATION
    // ==========================================
    async function setupPSGCAddressLogic() {
        try {
            const response = await fetch('https://psgc.gitlab.io/api/provinces.json');
            const provinces = await response.json();
            provinces.sort((a, b) => a.name.localeCompare(b.name));

            const provinceDropdowns = document.querySelectorAll('.psgc-province');
            provinceDropdowns.forEach(select => {
                select.innerHTML = '<option value="">SELECT PROVINCE</option>';
                provinces.forEach(prov => {
                    select.innerHTML += `<option value="${prov.code}" data-name="${prov.name}">${prov.name}</option>`;
                });

                select.addEventListener('change', async (e) => {
                    const provCode = e.target.value;
                    const selectedOpt = e.target.options[e.target.selectedIndex];
                    const provName = selectedOpt.getAttribute('data-name') || '';

                    const row = e.target.closest('.row');
                    const citySelect = row.querySelector('.psgc-city');
                    const hiddenProvInput = e.target.nextElementSibling;
                    if (hiddenProvInput) hiddenProvInput.value = provName;

                    citySelect.innerHTML = '<option value="">Loading Cities...</option>';
                    citySelect.disabled = true;

                    const bgrySelect = row.querySelector('.psgc-barangay');
                    if (bgrySelect) {
                        bgrySelect.innerHTML = '<option value="">Select City First</option>';
                        bgrySelect.disabled = true;
                    }

                    if (!provCode) return;

                    const cityRes = await fetch(`https://psgc.gitlab.io/api/provinces/${provCode}/cities-municipalities.json`);
                    const cities = await cityRes.json();
                    cities.sort((a, b) => a.name.localeCompare(b.name));

                    citySelect.innerHTML = '<option value="">SELECT CITY / MUNICIPALITY</option>';
                    cities.forEach(c => {
                        citySelect.innerHTML += `<option value="${c.code}" data-name="${c.name}">${c.name}</option>`;
                    });
                    citySelect.disabled = false;
                });
            });

            document.querySelectorAll('.psgc-city').forEach(select => {
                select.addEventListener('change', async (e) => {
                    const cityCode = e.target.value;
                    const selectedOpt = e.target.options[e.target.selectedIndex];
                    const cityName = selectedOpt.getAttribute('data-name') || '';

                    const row = e.target.closest('.row');
                    const hiddenCityInput = e.target.nextElementSibling;
                    if (hiddenCityInput) hiddenCityInput.value = cityName;

                    const bgrySelect = row.querySelector('.psgc-barangay');
                    if (!bgrySelect) return; 

                    bgrySelect.innerHTML = '<option value="">Loading Barangays...</option>';
                    bgrySelect.disabled = true;

                    if (!cityCode) return;

                    const bgryRes = await fetch(`https://psgc.gitlab.io/api/cities-municipalities/${cityCode}/barangays.json`);
                    const barangays = await bgryRes.json();
                    barangays.sort((a, b) => a.name.localeCompare(b.name));

                    bgrySelect.innerHTML = '<option value="">SELECT BARANGAY</option>';
                    barangays.forEach(b => {
                        bgrySelect.innerHTML += `<option value="${b.code}" data-name="${b.name}">${b.name}</option>`;
                    });
                    bgrySelect.disabled = false;
                });
            });

            document.querySelectorAll('.psgc-barangay').forEach(select => {
                select.addEventListener('change', (e) => {
                    const selectedOpt = e.target.options[e.target.selectedIndex];
                    const bgryName = selectedOpt.getAttribute('data-name') || '';
                    const hiddenBgryInput = e.target.nextElementSibling;
                    if (hiddenBgryInput) hiddenBgryInput.value = bgryName;
                });
            });

        } catch (err) {
            console.error("PSGC API Error:", err);
        }
    }

    setupPSGCAddressLogic();

    document.querySelectorAll('.manual-address-toggle').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const targetPrefix = e.target.getAttribute('data-target');
            const dropContainer = document.getElementById(`${targetPrefix}_dropdown_container`);
            const manualContainer = document.getElementById(`${targetPrefix}_manual_container`);

            if (e.target.checked) {
                dropContainer?.classList.add('d-none');
                manualContainer?.classList.remove('d-none');
                dropContainer?.querySelectorAll('select').forEach(s => s.removeAttribute('required'));
            } else {
                dropContainer?.classList.remove('d-none');
                manualContainer?.classList.add('d-none');
                dropContainer?.querySelectorAll('select').forEach(s => s.setAttribute('required', 'true'));
            }
        });
    });

    // ==========================================
    // 2. AGE COMPUTATION ENGINE
    // ==========================================
    const birthDateInput = document.getElementById('input_birth_date');
    const testDateInput = document.getElementById('input_test_date');
    const ageYearsInput = document.getElementById('input_age_years');
    const ageMonthsInput = document.getElementById('input_age_months');

    function calculateAge() {
        if (!birthDateInput || !birthDateInput.value) return;
        const bDate = new Date(birthDateInput.value);
        const tDate = (testDateInput && testDateInput.value) ? new Date(testDateInput.value) : new Date();

        if (isNaN(bDate) || isNaN(tDate)) return;

        let years = tDate.getFullYear() - bDate.getFullYear();
        let months = tDate.getMonth() - bDate.getMonth();
        
        if (tDate.getDate() < bDate.getDate()) months--;
        if (months < 0) { years--; months += 12; }

        if (ageYearsInput) ageYearsInput.value = years >= 0 ? years : 0;
        if (ageMonthsInput) ageMonthsInput.value = (years === 0 && months >= 0) ? months : "";
    }

    if (birthDateInput) birthDateInput.addEventListener('change', calculateAge);
    if (testDateInput) testDateInput.addEventListener('change', calculateAge);

    // ==========================================
    // 3. CONDITIONAL TOGGLES
    // ==========================================
    const selectSex = document.getElementById('select_sex');
    const pregnantContainer = document.getElementById('pregnant-container');

    selectSex?.addEventListener('change', (e) => {
        if (e.target.value === 'Female') {
            pregnantContainer?.classList.remove('d-none');
        } else {
            pregnantContainer?.classList.add('d-none');
            const pregInput = document.getElementById('currently_pregnant');
            if (pregInput) pregInput.checked = false;
        }
    });

    const selectNationality = document.getElementById('select_nationality');
    const nationalityOtherContainer = document.getElementById('nationality-other-container');

    selectNationality?.addEventListener('change', (e) => {
        if (e.target.value === 'OTHER') {
            nationalityOtherContainer?.classList.remove('d-none');
            document.getElementById('input_nationality_other')?.setAttribute('required', 'true');
        } else {
            nationalityOtherContainer?.classList.add('d-none');
            const optInput = document.getElementById('input_nationality_other');
            if (optInput) { optInput.removeAttribute('required'); optInput.value = ''; }
        }
    });

    const workingSelect = document.getElementById('working-select');
    const currentJobContainer = document.getElementById('current-job-container');
    const prevJobContainer = document.getElementById('prev-job-container');

    workingSelect?.addEventListener('change', (e) => {
        if (e.target.value === 'Yes') {
            currentJobContainer?.classList.remove('d-none');
            prevJobContainer?.classList.add('d-none');
        } else if (e.target.value === 'No') {
            currentJobContainer?.classList.add('d-none');
            prevJobContainer?.classList.remove('d-none');
        } else {
            currentJobContainer?.classList.add('d-none');
            prevJobContainer?.classList.add('d-none');
        }
    });

    const overseasSelect = document.getElementById('overseas-select');
    const overseasFieldsContainer = document.getElementById('overseas-fields-container');

    overseasSelect?.addEventListener('change', (e) => {
        if (e.target.value === 'Yes') overseasFieldsContainer?.classList.remove('d-none');
        else overseasFieldsContainer?.classList.add('d-none');
    });

    document.querySelectorAll('.date-trigger').forEach(trigger => {
        trigger.addEventListener('change', (e) => {
            const row = e.target.closest('tr');
            const dateInput = row?.querySelector('input[type="month"]');
            if (!dateInput) return;
            if (e.target.checked) dateInput.classList.remove('d-none');
            else { dateInput.classList.add('d-none'); dateInput.value = ''; }
        });
    });

    const btnPrevTestNo = document.getElementById('btn-prev-test-no');
    const btnPrevTestYes = document.getElementById('btn-prev-test-yes');
    const prevTestDetails = document.getElementById('prev-test-details');
    const prevTestBoolInput = document.getElementById('prev_test_bool');

    btnPrevTestNo?.addEventListener('click', () => {
        if (prevTestBoolInput) prevTestBoolInput.value = "No";
        btnPrevTestNo.classList.replace('btn-outline-secondary', 'btn-secondary');
        btnPrevTestYes.classList.replace('btn-amber', 'btn-outline-amber');
        prevTestDetails?.classList.add('d-none');
    });

    btnPrevTestYes?.addEventListener('click', () => {
        if (prevTestBoolInput) prevTestBoolInput.value = "Yes";
        btnPrevTestYes.classList.replace('btn-outline-amber', 'btn-amber');
        btnPrevTestNo.classList.replace('btn-secondary', 'btn-outline-secondary');
        prevTestDetails?.classList.remove('d-none');
    });

    // ==========================================
    // 4. CANVAS SIGNATURE DRAW PAD ENGINE (BLACK INK)
    // ==========================================
    const canvas = document.getElementById("signature-pad");
    const ctx = canvas ? canvas.getContext("2d") : null;
    let isDrawing = false;

    function resizeCanvas() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width && rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }
    }

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { 
            x: (clientX - rect.left) * (canvas.width / rect.width), 
            y: (clientY - rect.top) * (canvas.height / rect.height) 
        };
    }

    function startDraw(e) {
        isDrawing = true;
        hasSignatureDrawn = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        validateConsentFields();
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = "#000000"; // Signature drawn in BLACK
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.stroke();
    }

    function stopDraw() {
        if (isDrawing) {
            isDrawing = false;
            document.getElementById("hidden-signature-data").value = canvas.toDataURL("image/png");
        }
    }

    if (canvas) {
        canvas.addEventListener("mousedown", startDraw);
        canvas.addEventListener("mousemove", draw);
        canvas.addEventListener("mouseup", stopDraw);

        canvas.addEventListener("touchstart", startDraw, { passive: false });
        canvas.addEventListener("touchmove", draw, { passive: false });
        canvas.addEventListener("touchend", stopDraw);
    }

    document.getElementById("btn-clear-signature")?.addEventListener("click", () => {
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        document.getElementById("hidden-signature-data").value = "";
        hasSignatureDrawn = false;
        validateConsentFields();
    });

    // ==========================================
    // 5. INFORMED CONSENT MODAL
    // ==========================================
    const consentModalEl = document.getElementById('consentModal');
    const consentModal = consentModalEl ? new bootstrap.Modal(consentModalEl, { backdrop: 'static', keyboard: false }) : null;
    
    consentModalEl?.addEventListener('shown.bs.modal', resizeCanvas);
    consentModal?.show();

    const consentCheck = document.getElementById('consent-check');
    const contactInput = document.getElementById('consent-contact');
    const proceedBtn = document.getElementById('btn-grant-consent');

    function validateConsentFields() {
        const hasConsent = consentCheck ? consentCheck.checked : false;
        const hasContact = contactInput ? contactInput.value.trim().length >= 7 : false;
        if (proceedBtn) proceedBtn.disabled = !(hasConsent && hasContact && hasSignatureDrawn);
    }

    consentCheck?.addEventListener('change', validateConsentFields);
    contactInput?.addEventListener('input', validateConsentFields);

    proceedBtn?.addEventListener('click', () => {
        document.getElementById('hidden-verbal-consent').value = "Yes";
        document.getElementById('hidden-contact-number').value = contactInput.value.trim();
        document.getElementById('hidden-email-address').value = document.getElementById('consent-email')?.value.trim() || "";
        consentModal.hide();
    });

    // ==========================================
    // 6. FORM STEP WIZARD NAVIGATION
    // ==========================================
    const steps = document.querySelectorAll('.form-step');
    let currentStep = 0;

    document.querySelectorAll('.btn-next').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep < steps.length - 1) {
                steps[currentStep].classList.remove('active');
                currentStep++;
                steps[currentStep].classList.add('active');
                document.getElementById('step-indicator').innerText = `Step ${currentStep + 1} of ${steps.length}`;
            }
        });
    });

    document.querySelectorAll('.btn-prev').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep > 0) {
                steps[currentStep].classList.remove('active');
                currentStep--;
                steps[currentStep].classList.add('active');
                document.getElementById('step-indicator').innerText = `Step ${currentStep + 1} of ${steps.length}`;
            }
        });
    });

    // ==========================================
    // 7. COMPLETE SUMMARY REVIEW POPULATOR
    // ==========================================
    const btnOpenReview = document.getElementById('btn-open-review-modal');
    const reviewModalEl = document.getElementById('summaryReviewModal');
    const reviewModal = reviewModalEl ? new bootstrap.Modal(reviewModalEl) : null;

    btnOpenReview?.addEventListener('click', () => {
        const form = document.getElementById('hts-data-form');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        const fullName = `${data.first_name || ''} ${data.middle_name || ''} ${data.last_name || ''} ${data.suffix || ''}`.trim();
        document.getElementById('summary-name').innerText = fullName || 'N/A';
        document.getElementById('summary-test-date').innerText = data.test_date || 'N/A';
        document.getElementById('summary-bdate').innerText = data.birth_date || 'N/A';
        
        const ageY = data.age_years ? `${data.age_years} yrs` : '';
        const ageM = data.age_months ? `${data.age_months} mos` : '';
        document.getElementById('summary-age').innerText = `${ageY} ${ageM}`.trim() || 'N/A';

        const mother = (data.mother_code || "").toUpperCase();
        const father = (data.father_code || "").toUpperCase();
        const order = String(data.birth_order || "").padStart(2, "0");
        const bdate = (data.birth_date || "").replace(/-/g, "");
        document.getElementById('summary-uic').innerText = `${mother}${father}${order}${bdate}` || 'N/A';

        const currAddr = data.curr_province_text ? `${data.curr_barangay_text || ''}, ${data.curr_city_text || ''}, ${data.curr_province_text || ''}` : `${data.curr_barangay || ''}, ${data.curr_city || ''}, ${data.curr_province || ''}`;
        document.getElementById('summary-curr-addr').innerText = currAddr.replace(/^, |, $/g, '') || 'N/A';

        const permAddr = data.perm_province_text ? `${data.perm_city_text || ''}, ${data.perm_province_text || ''}` : `${data.perm_city || ''}, ${data.perm_province || ''}`;
        document.getElementById('summary-perm-addr').innerText = permAddr.replace(/^, |, $/g, '') || 'N/A';

        const birthAddr = data.birth_province_text ? `${data.birth_city_text || ''}, ${data.birth_province_text || ''}` : `${data.birth_city || ''}, ${data.birth_province || ''}`;
        document.getElementById('summary-birth-addr').innerText = birthAddr.replace(/^, |, $/g, '') || 'N/A';

        document.getElementById('summary-sex-gender').innerText = `${data.sex || ''} / ${data.gender_identity === 'Others' ? data.gender_identity_other : (data.gender_identity || 'N/A')}`;
        document.getElementById('summary-civil-status').innerText = data.civil_status || 'N/A';
        document.getElementById('summary-nationality').innerText = data.nationality === 'OTHER' ? data.nationality_other : (data.nationality || 'N/A');
        
        const children = data.number_of_children || 0;
        const partner = data.living_with_partner === 'Yes' ? 'Yes' : 'No';
        document.getElementById('summary-partner-children').innerText = `${children} Children (Living w/ Partner: ${partner})`;

        document.getElementById('summary-education').innerText = data.education || 'N/A';
        document.getElementById('summary-in-school').innerText = data.in_school || 'No';
        
        const job = data.currently_working === 'Yes' ? `Working (${data.current_occupation || 'Main Income'})` : `Unemployed (Prev: ${data.previous_occupation || 'None'})`;
        document.getElementById('summary-occupation').innerText = job;
        
        const overseas = data.worked_overseas === 'Yes' ? `Yes (${data.overseas_country || 'N/A'} - ${data.overseas_base || 'Land'})` : 'No';
        document.getElementById('summary-overseas').innerText = overseas;

        document.getElementById('summary-mother-hiv').innerText = data.mother_hiv || 'DO NOT KNOW';

        const exposuresList = [];
        if (data.sex_male_bool === 'Yes') exposuresList.push(`Sex with Male (${data.sex_male_date || 'Date N/A'})`);
        if (data.sex_female_bool === 'Yes') exposuresList.push(`Sex with Female (${data.sex_female_date || 'Date N/A'})`);
        if (data.paid_sex_bool === 'Yes') exposuresList.push(`Paid for Sex (${data.paid_sex_date || 'Date N/A'})`);
        if (data.received_payment_bool === 'Yes') exposuresList.push(`Received Payment for Sex (${data.received_payment_date || 'Date N/A'})`);
        if (data.drugs_sex_bool === 'Yes') exposuresList.push(`Sex under Drug Influence (${data.drugs_sex_date || 'Date N/A'})`);
        if (data.shared_needles_bool === 'Yes') exposuresList.push(`Shared Needles (${data.shared_needles_date || 'Date N/A'})`);
        if (data.blood_transfusion_bool === 'Yes') exposuresList.push(`Blood Transfusion (${data.blood_transfusion_date || 'Date N/A'})`);
        if (data.occupational_exposure_bool === 'Yes') exposuresList.push(`Occupational Exposure (${data.occupational_exposure_date || 'Date N/A'})`);

        document.getElementById('summary-exposures').innerText = exposuresList.length ? exposuresList.join(' • ') : 'No active exposures selected.';

        if (data.prev_test_bool === 'Yes') {
            document.getElementById('summary-prev-testing').innerText = `Tested: Date: ${data.prev_test_date || 'N/A'}, Facility: ${data.prev_test_facility || 'N/A'}, City: ${data.prev_test_city || 'N/A'}, Result: ${data.prev_test_result || 'N/A'}`;
        } else {
            document.getElementById('summary-prev-testing').innerText = 'Never Tested Previously';
        }

        document.getElementById('summary-counseling-notes').innerText = data.counseling_notes || 'None';
        document.getElementById('summary-provider-name').innerText = data.service_provider_name || 'N/A';

        const sigData = document.getElementById('hidden-signature-data').value;
        document.getElementById('summary-signature-img').src = sigData || '';

        reviewModal?.show();
    });

    document.getElementById('btn-confirm-final-submit')?.addEventListener('click', async () => {
        reviewModal?.hide();
        document.getElementById('btn-proceed-to-linkage-step')?.click();
    });

    // ==========================================
    // 8. PWA INDEXEDDB OFFLINE QUEUE ENGINE
    // ==========================================
    function openIDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('HTS_PWA_DB', 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('pending_records')) {
                    db.createObjectStore('pending_records', { keyPath: 'local_id', autoIncrement: true });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveToIndexedDB(payload) {
        const db = await openIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('pending_records', 'readwrite');
            const store = tx.objectStore('pending_records');
            const req = store.add(payload);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function syncIndexedDBToCloud() {
        if (!navigator.onLine) return;
        try {
            const db = await openIDB();
            const tx = db.transaction('pending_records', 'readwrite');
            const store = tx.objectStore('pending_records');
            const getAllReq = store.getAll();

            getAllReq.onsuccess = async () => {
                const pendingList = getAllReq.result || [];
                if (pendingList.length === 0) return;

                console.log(`PWA Sync: Found ${pendingList.length} unsynced records. Pushing...`);

                for (const item of pendingList) {
                    const localId = item.local_id;
                    delete item.local_id;

                    if (typeof window.saveToFirebaseRealtime === 'function') {
                        await window.saveToFirebaseRealtime(item);
                    }

                    item.is_synced = 1;
                    await fetch('/api/sqlite/save-offline', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(item)
                    });

                    const delTx = db.transaction('pending_records', 'readwrite');
                    delTx.objectStore('pending_records').delete(localId);
                }
                console.log("PWA Sync Complete!");
            };
        } catch (err) {
            console.error("PWA Auto-Sync Error:", err);
        }
    }

    // ==========================================
    // 9. DUAL SUBMIT & LINKAGE HANDLER
    // ==========================================
    const btnProceedStep = document.getElementById('btn-proceed-to-linkage-step');
    btnProceedStep?.addEventListener('click', async () => {
        const form = document.getElementById('hts-data-form');
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        const mother = (payload.mother_code || "").toUpperCase();
        const father = (payload.father_code || "").toUpperCase();
        const order = String(payload.birth_order || "").padStart(2, "0");
        const bdate = (payload.birth_date || "").replace(/-/g, "");
        payload.uic = `${mother}${father}${order}${bdate}`;

        if (navigator.onLine) {
            // 1. Save directly to Firebase Cloud Firestore
            let firebaseKey = null;
            if (typeof window.saveToFirebaseRealtime === 'function') {
                firebaseKey = await window.saveToFirebaseRealtime(payload);
                console.log("Saved to Firebase Firestore with Document ID:", firebaseKey);
            }

            // 2. Save to local SQLite database via backend API
            payload.is_synced = firebaseKey ? 1 : 0;
            try {
                const response = await fetch('/api/sqlite/save-offline', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const resData = await response.json();
                currentRecordId = resData.record_id;
            } catch (err) {
                console.error("Local SQLite Save Error:", err);
                const localId = await saveToIndexedDB(payload);
                currentRecordId = `browser_idb_${localId}`;
            }
        } else {
            payload.is_synced = 0;
            const localId = await saveToIndexedDB(payload);
            currentRecordId = `browser_idb_${localId}`;
            alert("🌐 Offline Mode Active: Record stored in local browser memory. It will auto-sync when connected.");
        }

        const genLinkModal = new bootstrap.Modal(document.getElementById('generatedLinkModal'));
        genLinkModal.show();

        // Attach click listener for "PROCEED TO LINKAGE" button inside modal
        document.getElementById('btn-modal-proceed-linkage').onclick = () => {
            genLinkModal.hide();
            const linkageModal = new bootstrap.Modal(document.getElementById('linkageModal'));
            linkageModal.show();
        };
    });

    // Save final linkage result and trigger PDF print export window
    document.getElementById('linkage-form')?.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevents standard form submission and page refresh
        
        const resultVal = document.getElementById('linkage-result').value;
        if (!resultVal) return;

        if (!currentRecordId) {
            alert('Record ID not found. Please try submitting again.');
            return;
        }

        try {
            await fetch(`/api/records/${currentRecordId}/update-linkage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ linkage_result: resultVal })
            });
            window.open(`/records/${currentRecordId}/export`, '_blank');
        } catch (err) {
            console.error('Error updating linkage result:', err);
            window.open(`/records/${currentRecordId}/export`, '_blank');
        }
    });

    // ==========================================
    // 10. NETWORK CONNECTION LISTENERS
    // ==========================================
    window.addEventListener("online", () => {
        const badge = document.getElementById('network-badge');
        if (badge) {
            badge.className = 'badge bg-success';
            badge.innerText = 'ONLINE';
        }
        syncIndexedDBToCloud();
    });

    window.addEventListener("offline", () => {
        const badge = document.getElementById('network-badge');
        if (badge) {
            badge.className = 'badge bg-warning text-dark';
            badge.innerText = 'OFFLINE (PWA MODE)';
        }
    });
});