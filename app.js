/* ==========================================================================
   Horarios UTN - Lógica de la Aplicación (JavaScript Vanilla)
   ========================================================================== */

// 1. Estado de la Aplicación
let state = {
    subjects: [],   // Formato: { id, name, colorHue, isOfficial, plan, commissions: [ { id, name, slots: [ { day, startTime, endTime, classroom, teacher, term } ] } ] }
    selections: {},  // Formato: { [subjectId]: commissionId }
    expandedSubjectId: null, // ID de la materia que está expandida (las demás están colapsadas)
    officialSubjects: [], // Base de datos de materias oficiales sincronizadas
    officialUpdate: null,  // Fecha/hora de última sincronización
    config: {
        showWeekend: false,
        cropTimeRange: false
    }
};

// 2. Datos de Ejemplo (No utilizados)

// 3. Inicialización del Tema
function initTheme() {
    const savedTheme = localStorage.getItem('horauni_theme');
    const theme = (savedTheme === 'dark') ? 'theme-dark' : 'theme-light';
    document.body.className = theme;
    document.documentElement.className = theme;
}

// 3b. Popup de Confirmación Personalizado
function showConfirm(message) {
    return new Promise(resolve => {
        const overlay = document.getElementById('confirm-modal');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        msgEl.textContent = message;
        overlay.classList.remove('hidden');

        function cleanup(result) {
            overlay.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onOverlay);
            resolve(result);
        }

        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }
        function onOverlay(e) { if (e.target === overlay) cleanup(false); }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onOverlay);
    });
}

// 4. Carga y Guardado del Estado
function loadState() {
    const savedData = localStorage.getItem('horauni_state');
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            state.subjects = parsed.subjects || [];
            state.selections = parsed.selections || {};
            state.expandedSubjectId = parsed.expandedSubjectId || null;
            state.config = parsed.config || { showWeekend: false, cropTimeRange: false };
        } catch (e) {
            console.error('Error al cargar datos guardados, usando valores por defecto.', e);
            loadSampleData();
        }
    } else {
        loadSampleData();
    }
    loadOfficialState(); // Cargar base de datos oficial
    ensureUniqueSubjectColors();
}

function loadSampleData() {
    state.subjects = [];
    state.selections = {};
    state.expandedSubjectId = null;
    state.config = { showWeekend: false, cropTimeRange: false };
    saveState();
}

function saveState() {
    const stateToSave = {
        subjects: state.subjects,
        selections: state.selections,
        expandedSubjectId: state.expandedSubjectId || null,
        config: state.config || { showWeekend: false, cropTimeRange: false }
    };
    localStorage.setItem('horauni_state', JSON.stringify(stateToSave));
}
// 4b. Sincronización y Parser de Horarios Oficiales (UTN FRBB)
function saveOfficialState() {
    localStorage.setItem('horauni_official_subjects', JSON.stringify(state.officialSubjects || []));
    localStorage.setItem('horauni_official_update', state.officialUpdate || '');
}

function loadOfficialState() {
    const savedSubjects = localStorage.getItem('horauni_official_subjects');
    const savedUpdate = localStorage.getItem('horauni_official_update');

    try {
        state.officialSubjects = savedSubjects ? JSON.parse(savedSubjects) : [];
    } catch (e) {
        console.error('Error al parsear materias oficiales cargadas:', e);
        state.officialSubjects = [];
    }
    state.officialUpdate = savedUpdate || null;

    updateSyncStatusUI();
}

function formatSyncDate(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = String(date.getFullYear()).slice(-2);
    const hr = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y}, ${hr}:${min}`;
}

function updateSyncStatusUI() {
    const syncStatusText = document.getElementById('sync-status-text');
    const syncBtn = document.getElementById('open-sync-btn');

    if (!syncStatusText) return;

    const text = state.officialUpdate
        ? `Última actualización: ${state.officialUpdate}`
        : 'Horarios oficiales no cargados';

    syncStatusText.innerText = text;

    // Deshabilitar botón mientras está sincronizando
    if (syncBtn) syncBtn.disabled = state._syncing || false;
}

// URL del mirror de GitHub con los horarios oficiales
const GITHUB_HORARIOS_URL = 'https://raw.githubusercontent.com/catra6/horarios-utn/main/horarios-2c-2026.html';

async function fetchFromGitHub() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
        const response = await fetch(GITHUB_HORARIOS_URL, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Error de red: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const decoder = new TextDecoder('iso-8859-1');
        return decoder.decode(buffer);
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

function processOfficialHTML(htmlText) {
    if (!htmlText || htmlText.trim().length === 0) {
        throw new Error('El HTML recibido está vacío.');
    }
    const subjects = parseOfficialHTML(htmlText);
    if (subjects.length === 0) {
        throw new Error('No se encontraron materias en el HTML. Verifica que el formato sea correcto.');
    }

    state.officialSubjects = subjects;
    state.officialUpdate = formatSyncDate(new Date());

    saveOfficialState();
    updateSyncStatusUI();
    return subjects;
}

async function syncOfficialSchedules() {
    const statusText = document.getElementById('sync-status-text');
    const syncBtn = document.getElementById('open-sync-btn');

    // Evitar sincronizaciones simultáneas
    if (state._syncing) return;
    state._syncing = true;

    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.classList.add('spinning');
    }
    if (statusText) statusText.innerText = 'Sincronizando...';

    try {
        const html = await fetchFromGitHub();
        const subjects = processOfficialHTML(html);
        console.log(`Sincronización exitosa: ${subjects.length} materias oficiales cargadas.`);
    } catch (error) {
        console.error('Error en sincronización:', error);
        if (statusText) {
            statusText.innerText = state.officialUpdate
                ? `Última actualización: ${state.officialUpdate} (error al actualizar)`
                : 'Error al cargar horarios';
        }
    } finally {
        state._syncing = false;
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.classList.remove('spinning');
        }
    }
}

// Parser HTML con DOMParser y expresiones regulares
function parseOfficialHTML(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const trs = doc.querySelectorAll('tr');
    const parsedSubjects = {};
    let currentSectionAula = '';

    // Regex flexible para campos: Nombre, Plan, Comisión, Cuatrimestre, Docente, Aula (opcional), Horas
    const entryRegex = /^([\s\S]+?)\(\s*(\d+)\s*\)\s*-\s*Com:\s*([^-]+)-\s*\(([^)]+)\)\s*-\s*\(([^)]+)\)(?:\s*(?:\*\*|\s)*\(?\s*((?:AULA|LAB)\s*[:\s]*[^\)\*]+)\)?\s*(?:\*\*|\s)*)?\s*\((\d{2}:\d{2})\s*[-–—\s]\s*(\d{2}:\d{2})\)$/i;

    trs.forEach(tr => {
        const cleanTrText = tr.textContent.replace(/\s+/g, ' ').trim();

        // Si la fila es un encabezado de sección que contiene AULA: XXX o AULA XXX (sin Com:)
        if (!cleanTrText.includes('Com:')) {
            const secMatch = cleanTrText.match(/AULA\s*:?\s*(\w+)/i);
            if (secMatch) {
                currentSectionAula = `AULA ${secMatch[1]}`;
            }
        }

        const tds = tr.querySelectorAll('td');
        if (tds.length >= 7) {
            const timeSlotText = tds[0].textContent.replace(/\s+/g, '').trim();
            if (/^\d{2}:\d{2}[-–—\s]?\d{2}:\d{2}$/.test(timeSlotText) || /^\d{2}:\d{2}$/.test(timeSlotText)) {
                for (let dayIdx = 1; dayIdx < 7; dayIdx++) {
                    const cellText = tds[dayIdx].textContent;
                    if (!cellText || !cellText.includes('Com:')) continue;

                    const text = cellText.replace(/\s+/g, ' ').trim();
                    const match = text.match(entryRegex);

                    if (match) {
                        const subjectName = match[1].trim();
                        const plan = match[2].trim();
                        const commission = match[3].trim();
                        const term = match[4].trim();
                        const teacher = match[5].trim();
                        let classroom = match[6] ? match[6].trim() : '';

                        if (!classroom) {
                            const inlineAulaMatch = text.match(/\(?\s*(AULA\s*[:\s]*\w+)\s*\)?/i);
                            if (inlineAulaMatch) {
                                classroom = inlineAulaMatch[1].trim();
                            }
                        }

                        if (!classroom) {
                            classroom = currentSectionAula;
                        }

                        const startTime = match[7].trim();
                        const endTime = match[8].trim();

                        const dayVal = dayIdx.toString(); // '1' = Lunes, '2' = Martes, etc.
                        const subjectKey = `${subjectName}_${plan}`;

                        if (!parsedSubjects[subjectKey]) {
                            parsedSubjects[subjectKey] = {
                                id: 's_official_' + subjectKey.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                                name: subjectName,
                                plan: plan,
                                isOfficial: true,
                                commissions: {}
                            };
                        }

                        if (!parsedSubjects[subjectKey].commissions[commission]) {
                            parsedSubjects[subjectKey].commissions[commission] = {
                                id: 'c_official_' + subjectKey.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + commission.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                                name: `Comisión ${commission}`,
                                slots: []
                            };
                        }

                        const slots = parsedSubjects[subjectKey].commissions[commission].slots;
                        const duplicate = slots.some(s => s.day === dayVal && s.startTime === startTime && s.endTime === endTime);
                        if (!duplicate) {
                            slots.push({
                                day: dayVal,
                                startTime: startTime,
                                endTime: endTime,
                                classroom: classroom,
                                teacher: teacher,
                                term: term
                            });
                        }
                    }
                }
            }
        }
    });

    // Convertir comisiones de objeto a array
    return Object.values(parsedSubjects).map(sub => {
        sub.commissions = Object.values(sub.commissions);
        return sub;
    });
}


// 5. Utilidades y Generadores
function removeAccents(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getDayName(dayVal) {
    const days = {
        '1': 'Lunes',
        '2': 'Martes',
        '3': 'Miércoles',
        '4': 'Jueves',
        '5': 'Viernes',
        '6': 'Sábado',
    };
    return days[dayVal] || '';
}

const DISTINCT_HUES = [
    210, // Azul Océano
    145, // Verde Menta
    270, // Púrpura / Violeta
    25,  // Naranja Cálido
    340, // Rosa Frambuesa
    185, // Cyan Neón
    45,  // Dorado / Ámbar
    160, // Turquesa
    290, // Magenta / Orquídea
    230, // Índigo
    15,  // Coral
    195  // Azul Cielo
];

function ensureUniqueSubjectColors() {
    if (!state.subjects || state.subjects.length === 0) return;
    const usedHues = [];
    let updated = false;

    state.subjects.forEach((subject, idx) => {
        let hue = subject.colorHue;
        const isConflict = hue === undefined || hue === null || usedHues.some(h => Math.abs(h - hue) < 22 || Math.abs(h - hue) > 338);

        if (isConflict) {
            let selectedHue = null;
            for (const candidate of DISTINCT_HUES) {
                const conflict = usedHues.some(h => Math.abs(h - candidate) < 22 || Math.abs(h - candidate) > 338);
                if (!conflict) {
                    selectedHue = candidate;
                    break;
                }
            }
            if (selectedHue === null) {
                selectedHue = Math.floor((idx * 137.5) % 360);
            }
            subject.colorHue = selectedHue;
            updated = true;
        }
        usedHues.push(subject.colorHue);
    });

    if (updated) {
        saveState();
    }
}

function generateColorHue() {
    ensureUniqueSubjectColors();
    const usedHues = (state.subjects || []).map(s => s.colorHue);
    for (const candidate of DISTINCT_HUES) {
        const conflict = usedHues.some(h => Math.abs(h - candidate) < 22 || Math.abs(h - candidate) > 338);
        if (!conflict) {
            return candidate;
        }
    }
    const lastHue = usedHues.length > 0 ? usedHues[usedHues.length - 1] : 0;
    return Math.floor((lastHue + 137.5) % 360);
}

function timeStrToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function timeStrToSlotIndex(timeStr) {
    const mins = timeStrToMinutes(timeStr);
    return mins - 480; // 08:00 = 480 minutos, precisión de 1 minuto
}

function slotToTimeStr(slotIndex) {
    const totalMins = 480 + slotIndex; // precisión de 1 minuto
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 24 && m === 0) return '00:00';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
}



// 6. Generación de las opciones de tiempo en bloques de 30 mins
function generateTimeOptions(selectedVal, isEnd = false) {
    let options = '';
    const startHour = 8;
    const endHour = 24;

    for (let hour = startHour; hour <= endHour; hour++) {
        if (!isEnd && hour === endHour) continue; // Start time no puede ser 24:00

        // Block :00
        if (!(isEnd && hour === startHour)) { // End time no puede ser 08:00
            const timeStr = `${String(hour).padStart(2, '0')}:00`;
            const displayStr = hour === 24 ? '00:00' : timeStr;
            const selected = selectedVal === timeStr ? 'selected' : '';
            options += `<option value="${timeStr}" ${selected}>${displayStr}</option>`;
        }

        // Block :30
        if (hour !== endHour) {
            const timeStr = `${String(hour).padStart(2, '0')}:30`;
            const selected = selectedVal === timeStr ? 'selected' : '';
            options += `<option value="${timeStr}" ${selected}>${timeStr}</option>`;
        }
    }

    return options;
}

function createSlotRowHTML(day = '1', startTime = '08:00', endTime = '10:00') {
    const days = [
        { val: '1', name: 'Lunes' },
        { val: '2', name: 'Martes' },
        { val: '3', name: 'Miércoles' },
        { val: '4', name: 'Jueves' },
        { val: '5', name: 'Viernes' },
        { val: '6', name: 'Sábado' },
        { val: '7', name: 'Domingo' },
    ];

    const dayOptions = days.map(d => `<option value="${d.val}" ${day === d.val ? 'selected' : ''}>${d.name}</option>`).join('');

    return `
        <div class="form-slot-row">
            <select class="slot-day" required>
                ${dayOptions}
            </select>
            <input type="text" class="slot-start" placeholder="Desde (HH:MM)" required value="${startTime}" maxlength="5" pattern="^(0[0-9]|1[0-9]|2[0-4]):[0-5][0-9]$" title="Formato HH:MM">
            <input type="text" class="slot-end" placeholder="Hasta (HH:MM)" required value="${endTime}" maxlength="5" pattern="^(0[0-9]|1[0-9]|2[0-4]):[0-5][0-9]$" title="Formato HH:MM">
            <button type="button" class="btn-card-action btn-card-delete btn-slot-delete" title="Eliminar Horario">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/>
                </svg>
            </button>
        </div>
    `;
}

// 7. Renderizar la grilla de fondo (Timetable Grid Structure)
const gridContainer = document.getElementById('timetable-grid');

function renderGridStructure() {
    gridContainer.innerHTML = '';
    gridContainer.removeAttribute('data-orientation');

    const showWeekend = state.config && state.config.showWeekend;
    const cropTimeRange = state.config && state.config.cropTimeRange;

    // Configuración de Días activos
    const activeDays = [
        { id: 1, name: 'Lunes' },
        { id: 2, name: 'Martes' },
        { id: 3, name: 'Miércoles' },
        { id: 4, name: 'Jueves' },
        { id: 5, name: 'Viernes' }
    ];
    if (showWeekend) {
        activeDays.push({ id: 6, name: 'Sábado' }, { id: 7, name: 'Domingo' });
    }

    // Configuración de Rango Horario
    let startHour = 8;
    let endHour = 24;

    if (cropTimeRange) {
        const activeSlots = [];
        state.subjects.forEach(subject => {
            const selectedId = state.selections[subject.id];
            if (selectedId && selectedId !== 'none') {
                const commission = subject.commissions.find(c => c.id === selectedId);
                if (commission) {
                    commission.slots.forEach(slot => {
                        const sDay = Number(slot.day);
                        if (showWeekend || sDay <= 5) {
                            activeSlots.push(slot);
                        }
                    });
                }
            }
        });

        if (activeSlots.length > 0) {
            let earliestMins = 1440;
            let latestMins = 0;
            activeSlots.forEach(slot => {
                const sMins = timeStrToMinutes(slot.startTime);
                const eMins = timeStrToMinutes(slot.endTime);
                if (sMins < earliestMins) earliestMins = sMins;
                if (eMins > latestMins) latestMins = eMins;
            });

            startHour = Math.floor(earliestMins / 60);
            endHour = Math.ceil(latestMins / 60);
            if (endHour <= startHour) endHour = startHour + 1;
        } else {
            startHour = 8;
            endHour = 20;
        }
    }

    gridContainer.setAttribute('data-start-hour', startHour);
    gridContainer.setAttribute('data-end-hour', endHour);

    const totalMinutes = (endHour - startHour) * 60;
    gridContainer.style.gridTemplateRows = `48px repeat(${totalMinutes}, var(--grid-row-height-1min, 1.3333px))`;
    gridContainer.style.gridTemplateColumns = `80px repeat(${activeDays.length}, minmax(110px, 1fr))`;

    // Cabecera superior izquierda (Hora)
    const timeHeader = document.createElement('div');
    timeHeader.className = 'grid-header grid-header-time';
    timeHeader.innerText = 'Hora';
    gridContainer.appendChild(timeHeader);

    // Cabeceras de días
    activeDays.forEach((dayObj, idx) => {
        const header = document.createElement('div');
        header.className = 'grid-header';
        header.style.gridRow = '1';
        header.style.gridColumn = `${idx + 2}`;
        header.innerText = dayObj.name;
        gridContainer.appendChild(header);
    });

    // Bloques horarios (startHour a endHour)
    for (let hour = startHour; hour < endHour; hour++) {
        const startRow = (hour - startHour) * 60 + 2;
        const endRow = startRow + 60;

        const timeLabel = document.createElement('div');
        timeLabel.className = 'time-label';
        timeLabel.style.gridRow = `${startRow} / ${endRow}`;
        timeLabel.style.gridColumn = '1';
        timeLabel.innerText = `${String(hour).padStart(2, '0')}:00`;
        gridContainer.appendChild(timeLabel);

        // Celdas de fondo para cada día activo (2 filas de media hora)
        activeDays.forEach((dayObj, idx) => {
            const cell1 = document.createElement('div');
            cell1.className = 'grid-cell hour-start';
            cell1.style.gridRow = `${startRow} / ${startRow + 30}`;
            cell1.style.gridColumn = `${idx + 2}`;
            gridContainer.appendChild(cell1);

            const cell2 = document.createElement('div');
            cell2.className = 'grid-cell half-hour-start';
            cell2.style.gridRow = `${startRow + 30} / ${endRow}`;
            cell2.style.gridColumn = `${idx + 2}`;
            gridContainer.appendChild(cell2);
        });
    }
}

// 8. Renderizar la Sidebar (Control de Materias)
const subjectsContainer = document.getElementById('subjects-container');

function renderSubjectsList() {
    ensureUniqueSubjectColors();
    subjectsContainer.innerHTML = '';

    if (state.subjects.length === 0) {
        subjectsContainer.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" width="48" height="48">
                    <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z"/>
                </svg>
                 <p>No tenés materias cargadas.</p>
                 <p class="subtext">Hacé clic en "Añadir materia" para comenzar.</p>
            </div>
        `;
        return;
    }

    state.subjects.forEach(subject => {
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.style.setProperty('--subject-color', `hsl(${subject.colorHue}, 75%, 55%)`);

        // Cabecera de la tarjeta
        const header = document.createElement('div');
        header.className = 'subject-card-header';

        // Botón de toggle (flechita/chevron)
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn-card-toggle';
        toggleBtn.title = 'Mostrar/ocultar comisiones';

        const isExpanded = state.expandedSubjectId === subject.id;
        toggleBtn.innerHTML = `
            <svg class="icon-chevron ${!isExpanded ? 'collapsed' : ''}" viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
            </svg>
        `;
        header.appendChild(toggleBtn);

        const title = document.createElement('div');
        title.className = 'subject-card-title';
        title.innerText = subject.name;

        if (subject.isOfficial) {
            const badge = document.createElement('span');
            badge.className = `badge-official plan-${subject.plan}`;
            badge.innerText = `Plan ${subject.plan === '95' ? '1995' : subject.plan}`;
            title.appendChild(badge);
        } else {
            const badge = document.createElement('span');
            badge.className = 'badge-official badge-extracurricular';
            badge.innerText = 'Extracurricular';
            title.appendChild(badge);
        }

        header.appendChild(title);

        const actions = document.createElement('div');
        actions.className = 'subject-card-actions';

        // Editar - Solo si NO es oficial
        if (!subject.isOfficial) {
            const editBtn = document.createElement('button');
            editBtn.className = 'btn-card-action';
            editBtn.title = 'Editar materia / actividad';
            editBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
            `;
            editBtn.addEventListener('click', () => openEditSubjectModal(subject.id));
            actions.appendChild(editBtn);
        }

        // Eliminar
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-card-action btn-card-delete';
        deleteBtn.title = 'Eliminar materia';
        deleteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
        `;
        deleteBtn.addEventListener('click', () => deleteSubject(subject.id));
        actions.appendChild(deleteBtn);

        header.appendChild(actions);
        card.appendChild(header);

        // Contenedor de Comisiones (acordeón con transición)
        const commContainer = document.createElement('div');
        commContainer.className = 'subject-card-commissions';
        if (isExpanded) {
            commContainer.classList.add('expanded');
        }

        const commInner = document.createElement('div');
        commInner.className = 'subject-card-commissions-inner';
        commContainer.appendChild(commInner);

        // Configurar evento de toggle al hacer clic en la cabecera (excluyendo los botones de editar/eliminar)
        header.addEventListener('click', (e) => {
            if (e.target.closest('.btn-card-action')) return;

            const isCurrentlyExpanded = commContainer.classList.contains('expanded');
            if (!isCurrentlyExpanded) {
                // Colapsar cualquier otra tarjeta expandida
                const activeExpanded = subjectsContainer.querySelector('.subject-card-commissions.expanded');
                if (activeExpanded) {
                    activeExpanded.classList.remove('expanded');
                    const activeCard = activeExpanded.closest('.subject-card');
                    if (activeCard) {
                        const activeChevron = activeCard.querySelector('.icon-chevron');
                        if (activeChevron) activeChevron.classList.add('collapsed');
                    }
                }

                // Expandir esta
                commContainer.classList.add('expanded');
                toggleBtn.querySelector('svg').classList.remove('collapsed');
                state.expandedSubjectId = subject.id;
            } else {
                // Colapsar esta
                commContainer.classList.remove('expanded');
                toggleBtn.querySelector('svg').classList.add('collapsed');
                state.expandedSubjectId = null;
            }
            saveState();
        });

        const selectedCommId = state.selections[subject.id] || 'none';

        // Opción: Ninguna
        const noneOption = document.createElement('label');
        noneOption.className = 'commission-option';
        noneOption.innerHTML = `
            <input type="radio" class="commission-radio" name="comm_${subject.id}" value="none" ${selectedCommId === 'none' ? 'checked' : ''}>
            <div class="commission-info">
                <span class="commission-name">Ninguna</span>
            </div>
        `;
        noneOption.querySelector('input').addEventListener('change', () => selectCommission(subject.id, 'none'));
        commInner.appendChild(noneOption);

        // Lista de comisiones
        subject.commissions.forEach(comm => {
            const label = document.createElement('label');
            label.className = 'commission-option';

            const timesSummary = comm.slots.map(s => {
                const dayName = getDayName(s.day);
                const classroomInfo = s.classroom ? ` (${s.classroom})` : '';
                return `${dayName} de ${s.startTime} a ${s.endTime}${classroomInfo}`;
            }).join(', ');

            label.innerHTML = `
                <input type="radio" class="commission-radio" name="comm_${subject.id}" value="${comm.id}" ${selectedCommId === comm.id ? 'checked' : ''}>
                <div class="commission-info">
                    <span class="commission-name">${comm.name}</span>
                    <span class="commission-time-summary">${timesSummary}</span>
                </div>
            `;
            label.querySelector('input').addEventListener('change', () => selectCommission(subject.id, comm.id));
            commInner.appendChild(label);
        });

        card.appendChild(commContainer);
        subjectsContainer.appendChild(card);
    });
}

async function deleteSubject(subjectId) {
    const confirmed = await showConfirm('¿Estás seguro de que deseas eliminar esta materia?');
    if (confirmed) {
        state.subjects = state.subjects.filter(s => s.id !== subjectId);
        delete state.selections[subjectId];
        saveState();
        renderSubjectsList();
        updateTimetable();
    }
}

function checkAndEnableWeekendForSlots(slots) {
    if (!slots || !Array.isArray(slots)) return;
    const hasWeekend = slots.some(s => Number(s.day) === 6 || Number(s.day) === 7);
    if (hasWeekend) {
        if (!state.config) state.config = {};
        state.config.showWeekend = true;
        saveState();
    }
}

function hasActiveWeekendSlots() {
    return state.subjects.some(subject => {
        const selectedId = state.selections[subject.id];
        if (selectedId && selectedId !== 'none') {
            const commission = subject.commissions.find(c => c.id === selectedId);
            if (commission && commission.slots) {
                return commission.slots.some(slot => Number(slot.day) === 6 || Number(slot.day) === 7);
            }
        }
        return false;
    });
}

function selectCommission(subjectId, commissionId) {
    state.selections[subjectId] = commissionId;
    if (commissionId !== 'none') {
        const subject = state.subjects.find(s => s.id === subjectId);
        if (subject) {
            const comm = subject.commissions.find(c => c.id === commissionId);
            if (comm) {
                checkAndEnableWeekendForSlots(comm.slots);
            }
        }
    }
    saveState();
    updateTimetable();
}

// 9. Actualizar la Grilla Horaria y Colisiones en Tiempo Real
const collisionPanel = document.getElementById('collision-panel');
const collisionList = document.getElementById('collision-list');

function updateTimetable() {
    renderGridStructure();
    const startHour = Number(gridContainer.getAttribute('data-start-hour')) || 8;
    const startMins = startHour * 60;
    const showWeekend = state.config && state.config.showWeekend;

    const activeDays = [1, 2, 3, 4, 5];
    if (showWeekend) activeDays.push(6, 7);

    // A. Eliminar bloques de eventos anteriores en la grilla
    const elementsToRemove = gridContainer.querySelectorAll('.timetable-event');
    elementsToRemove.forEach(el => el.remove());

    // B. Recopilar todos los bloques de horarios activos
    const activeSlots = [];
    state.subjects.forEach(subject => {
        const selectedId = state.selections[subject.id];
        if (selectedId && selectedId !== 'none') {
            const commission = subject.commissions.find(c => c.id === selectedId);
            if (commission) {
                commission.slots.forEach(slot => {
                    const dayNum = Number(slot.day);
                    const dayColIndex = activeDays.indexOf(dayNum);
                    if (dayColIndex !== -1) {
                        const sMins = timeStrToMinutes(slot.startTime);
                        const eMins = timeStrToMinutes(slot.endTime);
                        activeSlots.push({
                            subjectId: subject.id,
                            subjectName: subject.name,
                            colorHue: subject.colorHue,
                            commissionId: commission.id,
                            commissionName: commission.name,
                            day: slot.day,
                            dayColIndex: dayColIndex,
                            startMins: sMins,
                            endMins: eMins,
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            classroom: slot.classroom || '',
                            teacher: slot.teacher || ''
                        });
                    }
                });
            }
        }
    });

    // C. Detección de Colisiones
    const collisions = [];
    const conflictingSlotKeys = new Set();

    for (let i = 0; i < activeSlots.length; i++) {
        for (let j = i + 1; j < activeSlots.length; j++) {
            const a = activeSlots[i];
            const b = activeSlots[j];

            if (a.day === b.day && Math.max(a.startMins, b.startMins) < Math.min(a.endMins, b.endMins)) {
                collisions.push({
                    day: a.day,
                    slotA: a,
                    slotB: b
                });

                conflictingSlotKeys.add(`${a.subjectId}_${a.commissionId}_${a.day}_${a.startMins}_${a.endMins}`);
                conflictingSlotKeys.add(`${b.subjectId}_${b.commissionId}_${b.day}_${b.startMins}_${b.endMins}`);
            }
        }
    }

    // D. Renderizar los Eventos Activos
    const renderedConflictKeys = new Set();
    activeSlots.forEach(slot => {
        const eventEl = document.createElement('div');
        const slotKey = `${slot.subjectId}_${slot.commissionId}_${slot.day}_${slot.startMins}_${slot.endMins}`;
        const isConflicting = conflictingSlotKeys.has(slotKey);

        eventEl.className = `timetable-event ${isConflicting ? 'in-conflict' : ''}`;

        const startRow = (slot.startMins - startMins) + 2;
        const endRow = (slot.endMins - startMins) + 2;

        eventEl.style.gridRow = `${startRow} / ${endRow}`;
        eventEl.style.gridColumn = `${slot.dayColIndex + 2}`;
        eventEl.style.setProperty('--subject-color-hue', slot.colorHue);

        if (isConflicting) {
            const overlaps = activeSlots.filter(other =>
                other.day === slot.day &&
                Math.max(other.startMins, slot.startMins) < Math.min(other.endMins, slot.endMins)
            );
            const subjectNames = [...new Set(overlaps.map(o => o.subjectName))].sort();
            const conflictGroupKey = `${slot.day}_${subjectNames.join('|')}`;

            let conflictHTML = '';
            if (!renderedConflictKeys.has(conflictGroupKey)) {
                renderedConflictKeys.add(conflictGroupKey);
                if (subjectNames.length > 1) {
                    const last = subjectNames.pop();
                    conflictHTML = `Conflicto entre <strong>${subjectNames.join(', ')}</strong> y <strong>${last}</strong>`;
                } else {
                    conflictHTML = `Conflicto en <strong>${slot.subjectName}</strong>`;
                }
            }

            eventEl.innerHTML = conflictHTML ? `
                <div class="event-subject-conflict" title="Superposición de horarios">${conflictHTML}</div>
            ` : '';
        } else {
            const commTitle = slot.commissionName ? `<div class="event-commission" title="Comisión: ${slot.commissionName}">${slot.commissionName}</div>` : '';
            const classroomHTML = slot.classroom ? `<div class="event-classroom" title="${slot.classroom}">${slot.classroom}</div>` : '';
            const teacherHTML = slot.teacher ? `<div class="event-teacher" title="${slot.teacher}">${slot.teacher}</div>` : '';

            eventEl.innerHTML = `
                <div class="event-subject" title="${slot.subjectName}">${slot.subjectName}</div>
                ${commTitle}
                ${classroomHTML}
                ${teacherHTML}
                <div class="event-time">${slot.startTime} - ${slot.endTime}</div>
            `;
        }

        gridContainer.appendChild(eventEl);
    });

    // E. Mostrar Alertas de Colisiones
    if (collisions.length > 0) {
        collisionPanel.classList.remove('hidden');
        collisionList.innerHTML = '';

        collisions.forEach(col => {
            const item = document.createElement('li');
            item.className = 'collision-item';

            const dayName = getDayName(col.day);
            const timeRange = `${slotToTimeStr(col.overlapStart)} - ${slotToTimeStr(col.overlapEnd)}`;

            item.innerHTML = `
                <div class="collision-text">
                    <strong>${dayName} (${timeRange})</strong>: 
                    <span>"${col.slotA.subjectName}" (Comisión: ${col.slotA.commissionName}) colisiona con "${col.slotB.subjectName}" (Comisión: ${col.slotB.commissionName}).</span>
                </div>
            `;
            collisionList.appendChild(item);
        });
    } else {
        collisionPanel.classList.add('hidden');
    }
}

// 10. Gestión del Modal de Materias / Actividades Extracurriculares
const subjectModal = document.getElementById('subject-modal');
const subjectForm = document.getElementById('subject-form');
const extracurricularSlotsList = document.getElementById('extracurricular-slots-list');
const addExtracurricularSlotBtn = document.getElementById('add-extracurricular-slot-btn');
const editSubjectIdInput = document.getElementById('edit-subject-id');

function openAddSubjectModal() {
    document.getElementById('modal-title').innerText = 'Añadir materia o actividad';
    editSubjectIdInput.value = '';
    subjectForm.reset();

    if (extracurricularSlotsList) {
        extracurricularSlotsList.innerHTML = '';
        extracurricularSlotsList.appendChild(htmlToElement(createSlotRowHTML()));
    }

    // Limpiar buscador oficial
    const searchInput = document.getElementById('subject-search-input');
    const resultsList = document.getElementById('search-results-list');
    const officialDetail = document.getElementById('official-subject-detail');
    const addOfficialSubjectBtn = document.getElementById('add-official-subject-btn');
    if (searchInput) {
        searchInput.value = '';
        resultsList.classList.add('hidden');
        officialDetail.classList.add('hidden');
        selectedOfficialSubject = null;
        addOfficialSubjectBtn.disabled = true;
    }

    // Configurar Tabs
    const tabsContainer = document.getElementById('subject-modal-tabs');
    if (tabsContainer) {
        tabsContainer.classList.remove('hidden');
        if (state.officialSubjects && state.officialSubjects.length > 0) {
            selectTab('official');
        } else {
            selectTab('manual');
        }
    }

    subjectModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function openEditSubjectModal(subjectId) {
    const subject = state.subjects.find(s => s.id === subjectId);
    if (!subject) return;

    document.getElementById('modal-title').innerText = subject.isOfficial ? 'Editar materia' : 'Editar actividad';
    editSubjectIdInput.value = subject.id;
    document.getElementById('subject-name').value = subject.name;

    if (extracurricularSlotsList) {
        extracurricularSlotsList.innerHTML = '';
        const slots = subject.commissions[0]?.slots || [];
        if (slots.length === 0) {
            extracurricularSlotsList.appendChild(htmlToElement(createSlotRowHTML()));
        } else {
            slots.forEach(slot => {
                extracurricularSlotsList.appendChild(htmlToElement(createSlotRowHTML(slot.day, slot.startTime, slot.endTime)));
            });
        }
    }

    const tabsContainer = document.getElementById('subject-modal-tabs');
    if (tabsContainer) {
        tabsContainer.classList.add('hidden');
    }
    selectTab('manual');

    subjectModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function closeModal() {
    subjectModal.classList.add('hidden');
    document.body.classList.remove('modal-open');

    const searchInput = document.getElementById('subject-search-input');
    const resultsList = document.getElementById('search-results-list');
    const officialDetail = document.getElementById('official-subject-detail');
    const addOfficialSubjectBtn = document.getElementById('add-official-subject-btn');
    if (searchInput) {
        searchInput.value = '';
        resultsList.classList.add('hidden');
        officialDetail.classList.add('hidden');
        selectedOfficialSubject = null;
        addOfficialSubjectBtn.disabled = true;
    }
}

// Botón para añadir nuevo horario en formulario extracurricular
if (addExtracurricularSlotBtn) {
    addExtracurricularSlotBtn.addEventListener('click', () => {
        if (extracurricularSlotsList) {
            extracurricularSlotsList.appendChild(htmlToElement(createSlotRowHTML()));
        }
    });
}

// Eliminar horario en formulario extracurricular
if (extracurricularSlotsList) {
    extracurricularSlotsList.addEventListener('click', async (e) => {
        const deleteSlotBtn = e.target.closest('.btn-slot-delete');
        if (deleteSlotBtn) {
            const row = deleteSlotBtn.closest('.form-slot-row');
            if (extracurricularSlotsList.children.length > 1) {
                const confirmed = await showConfirm('¿Estás seguro de que deseas eliminar este horario?');
                if (confirmed) {
                    row.remove();
                }
            } else {
                alert('Debes mantener al menos un horario.');
            }
        }
    });
}

// Guardar materia / extracurricular en Submit del modal
subjectForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const subjectId = editSubjectIdInput.value;
    const subjectName = document.getElementById('subject-name').value.trim();

    const slotRows = extracurricularSlotsList.querySelectorAll('.form-slot-row');
    if (slotRows.length === 0) {
        alert('Debes añadir al menos un horario.');
        return;
    }

    const slots = [];
    let isValid = true;

    slotRows.forEach(row => {
        const day = row.querySelector('.slot-day').value;
        const startTime = row.querySelector('.slot-start').value;
        const endTime = row.querySelector('.slot-end').value;

        const startMins = timeStrToMinutes(startTime);
        const endMins = timeStrToMinutes(endTime);

        if (endMins <= startMins) {
            alert(`Error en el horario: La hora de fin (${endTime}) debe ser estrictamente posterior a la de inicio (${startTime}).`);
            isValid = false;
        }

        slots.push({ day, startTime, endTime });
    });

    if (!isValid) return;

    const commId = 'comm_' + (subjectId || Date.now());
    const commissions = [{ id: commId, name: 'Única', slots }];

    checkAndEnableWeekendForSlots(slots);

    if (subjectId) {
        const subIndex = state.subjects.findIndex(s => s.id === subjectId);
        if (subIndex > -1) {
            state.subjects[subIndex].name = subjectName;
            state.subjects[subIndex].commissions = commissions;
            state.selections[subjectId] = commId;
        }
    } else {
        const newSubjectId = 'sub_' + Date.now();
        const colorHue = generateColorHue();

        state.subjects.push({
            id: newSubjectId,
            name: subjectName,
            isOfficial: false,
            isExtracurricular: true,
            colorHue: colorHue,
            commissions: commissions
        });

        state.selections[newSubjectId] = commId;
    }

    saveState();
    renderSubjectsList();
    updateTimetable();
    closeModal();
});

// 10b. Gestión del Modal de Configuración
const configModal = document.getElementById('config-modal');
const openConfigBtn = document.getElementById('open-config-btn');
const configCloseBtn = document.getElementById('config-close-btn');
const configOkBtn = document.getElementById('config-ok-btn');
const cfgShowWeekend = document.getElementById('cfg-show-weekend');
const cfgCropTimeRange = document.getElementById('cfg-crop-timerange');

function openConfigModal() {
    if (!state.config) state.config = { showWeekend: false, cropTimeRange: false };
    if (cfgShowWeekend) cfgShowWeekend.checked = !!state.config.showWeekend;
    if (cfgCropTimeRange) cfgCropTimeRange.checked = !!state.config.cropTimeRange;
    configModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function closeConfigModal() {
    configModal.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

async function applyConfigChanges() {
    if (!state.config) state.config = {};

    const wantHideWeekend = cfgShowWeekend && !cfgShowWeekend.checked;
    if (wantHideWeekend && hasActiveWeekendSlots()) {
        const confirmed = await showConfirm('Tenés materias o actividades asignadas el fin de semana (sábado/domingo). Si ocultás el fin de semana, no se visualizarán en la tabla. ¿Deseás ocultar el fin de semana de todos modos?');
        if (!confirmed) {
            cfgShowWeekend.checked = true;
            state.config.showWeekend = true;
            saveState();
            updateTimetable();
            return;
        }
    }

    state.config.showWeekend = cfgShowWeekend ? cfgShowWeekend.checked : false;
    state.config.cropTimeRange = cfgCropTimeRange ? cfgCropTimeRange.checked : false;
    saveState();
    updateTimetable();
}

if (openConfigBtn) openConfigBtn.addEventListener('click', openConfigModal);
if (configCloseBtn) configCloseBtn.addEventListener('click', closeConfigModal);
if (configOkBtn) {
    configOkBtn.addEventListener('click', () => {
        applyConfigChanges();
        closeConfigModal();
    });
}
if (cfgShowWeekend) cfgShowWeekend.addEventListener('change', applyConfigChanges);
if (cfgCropTimeRange) cfgCropTimeRange.addEventListener('change', applyConfigChanges);

// Formateador y validador en tiempo real de entradas de hora
subjectForm.addEventListener('input', (e) => {
    if (e.target.classList.contains('slot-start') || e.target.classList.contains('slot-end')) {
        formatTimeInput(e.target, e);
    }
});

function formatTimeInput(input, e) {
    if (e.inputType && e.inputType.startsWith('delete')) {
        return;
    }

    let val = input.value.replace(/\D/g, ''); // Solo números

    if (val.length === 1) {
        const d = parseInt(val[0], 10);
        if (d >= 3 && d <= 9) {
            input.value = '0' + val + ':';
        }
    } else if (val.length === 2) {
        let hour = parseInt(val, 10);
        if (hour > 24) {
            val = '24';
        }
        input.value = val + ':';
    } else if (val.length >= 3) {
        let hour = val.slice(0, 2);
        let minFirst = val[2];

        if (parseInt(hour, 10) > 24) {
            hour = '24';
        }

        if (hour === '24') {
            minFirst = '0';
        } else if (parseInt(minFirst, 10) > 5) {
            minFirst = '5';
        }

        let minSecond = val[3] || '';
        if (hour === '24' && minSecond !== '') {
            minSecond = '0';
        }

        input.value = hour + ':' + minFirst + minSecond;
    }
}

// Eventos de Cierre
const modalCloseBtn = document.getElementById('modal-close-btn');
if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);

if (subjectModal) {
    subjectModal.addEventListener('click', (e) => {
        if (e.target === subjectModal) {
            closeModal();
        }
    });
}

// 11. Acciones de Encabezado y Otros Botones
const addSubjectBtn = document.getElementById('add-subject-btn');
if (addSubjectBtn) addSubjectBtn.addEventListener('click', openAddSubjectModal);

const themeToggleBtn = document.getElementById('theme-toggle');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        if (document.body.classList.contains('theme-dark')) {
            document.body.className = 'theme-light';
            document.documentElement.className = 'theme-light';
            localStorage.setItem('horauni_theme', 'light');
        } else {
            document.body.className = 'theme-dark';
            document.documentElement.className = 'theme-dark';
            localStorage.setItem('horauni_theme', 'dark');
        }
    });
}

const clearDataBtn = document.getElementById('clear-data-btn');
if (clearDataBtn) {
    clearDataBtn.addEventListener('click', async () => {
        const confirmed = await showConfirm('¿Estás seguro de que deseas borrar todos los datos y reiniciar? Esta acción no se puede deshacer.');
        if (confirmed) {
            state.subjects = [];
            state.selections = {};
            saveState();
            renderSubjectsList();
            updateTimetable();
        }
    });
}

function updateGridCommissionVisibility(grid, val) {
    // Umbral de 80% de altura entre min (0.54) y max (1.08) -> 0.97
    const showComm = val >= 0.97;
    grid.setAttribute('data-show-commission', showComm ? 'true' : 'false');
}

function initTableSize() {
    let savedVal = localStorage.getItem('horauni_tablesize_val');
    let val = parseFloat(savedVal);
    if (isNaN(val) || val > 1.08 || val < 0.54) {
        val = 0.81;
    }

    const grid = document.getElementById('timetable-grid');
    const slider = document.getElementById('zoom-slider');

    if (slider) {
        slider.min = "0.74";
        slider.max = "1.18";
        slider.step = "0.02";
        slider.value = val.toString();
    }

    grid.style.setProperty('--grid-row-height-1min', `${val}px`);

    let size = 'normal';
    if (val < 0.7) size = 'compact';
    else if (val > 0.95) size = 'spacious';
    grid.setAttribute('data-size', size);
    updateGridCommissionVisibility(grid, val);
}

// Evento de control de zoom con slider
const zoomSlider = document.getElementById('zoom-slider');
if (zoomSlider) {
    zoomSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const grid = document.getElementById('timetable-grid');
        grid.style.setProperty('--grid-row-height-1min', `${val}px`);

        let size = 'normal';
        if (val < 0.7) size = 'compact';
        else if (val > 0.95) size = 'spacious';
        grid.setAttribute('data-size', size);
        updateGridCommissionVisibility(grid, val);

        localStorage.setItem('horauni_tablesize_val', val.toString());
    });
}

// Inicialización de las funciones de Búsqueda y Sincronización
let selectedOfficialSubject = null;

function selectTab(tabType) {
    const tabOfficialBtn = document.getElementById('tab-official-btn');
    const tabManualBtn = document.getElementById('tab-manual-btn');
    const officialSection = document.getElementById('modal-official-section');
    const manualSection = document.getElementById('subject-form');

    if (!tabOfficialBtn || !tabManualBtn) return;

    if (tabType === 'official') {
        tabOfficialBtn.classList.add('active');
        tabManualBtn.classList.remove('active');
        officialSection.classList.remove('hidden');
        manualSection.classList.add('hidden');
    } else {
        tabOfficialBtn.classList.remove('active');
        tabManualBtn.classList.add('active');
        officialSection.classList.add('hidden');
        manualSection.classList.remove('hidden');
    }
}

function initSyncAndSearchFeatures() {
    // 1. Tabs del Modal de Materias
    const tabOfficialBtn = document.getElementById('tab-official-btn');
    const tabManualBtn = document.getElementById('tab-manual-btn');
    if (tabOfficialBtn) tabOfficialBtn.addEventListener('click', () => selectTab('official'));
    if (tabManualBtn) tabManualBtn.addEventListener('click', () => selectTab('manual'));

    // 3. Autocompletado del Buscador
    const searchInput = document.getElementById('subject-search-input');
    const resultsList = document.getElementById('search-results-list');
    const officialDetail = document.getElementById('official-subject-detail');
    const addOfficialSubjectBtn = document.getElementById('add-official-subject-btn');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = removeAccents(searchInput.value.trim().toLowerCase());
            if (!query || !state.officialSubjects || state.officialSubjects.length === 0) {
                if (resultsList) resultsList.classList.add('hidden');
                return;
            }

            const matches = state.officialSubjects.filter(sub => {
                const normalizedSubName = removeAccents(sub.name.toLowerCase());
                return normalizedSubName.includes(query);
            });

            renderSearchResults(matches);
        });

        document.addEventListener('click', (e) => {
            if (resultsList && !resultsList.contains(e.target) && e.target !== searchInput) {
                resultsList.classList.add('hidden');
            }
        });
    }

    function renderSearchResults(matches) {
        if (!resultsList) return;
        resultsList.innerHTML = '';
        if (matches.length === 0) {
            resultsList.classList.add('hidden');
            return;
        }

        matches.slice(0, 10).forEach(sub => {
            const el = document.createElement('div');
            el.className = 'search-result-item';
            el.innerHTML = `
                <span class="search-result-name">${sub.name}</span>
                <span class="search-result-plan plan-${sub.plan}">Plan ${sub.plan === '95' ? '1995' : sub.plan}</span>
            `;
            el.addEventListener('click', () => {
                selectedOfficialSubject = sub;
                searchInput.value = sub.name;
                resultsList.classList.add('hidden');
                showOfficialSubjectDetail(sub);
            });
            resultsList.appendChild(el);
        });
        resultsList.classList.remove('hidden');
    }

    function showOfficialSubjectDetail(subject) {
        if (!officialDetail) return;

        document.getElementById('detail-subject-name').innerText = subject.name;
        const planBadge = document.getElementById('detail-subject-plan');
        if (planBadge) {
            planBadge.innerText = `Plan ${subject.plan === '95' ? '1995' : subject.plan}`;
            planBadge.className = `badge badge-plan plan-${subject.plan}`;
        }

        const commissionsList = document.getElementById('commissions-detail-list');
        if (commissionsList) {
            commissionsList.innerHTML = '';

            subject.commissions.forEach(comm => {
                const card = document.createElement('div');
                card.className = 'detail-commission-card';

                const slotsHTML = comm.slots.map(slot => {
                    const dayName = getDayName(slot.day);
                    const teacherInfo = slot.teacher ? `<div class="detail-comm-teacher">Docente: ${slot.teacher}</div>` : '';
                    const classroomInfo = slot.classroom ? `<span class="detail-comm-classroom">(${slot.classroom})</span>` : '';
                    return `
                        <div style="margin-bottom: 0.25rem;">
                            ${teacherInfo}
                            <div class="detail-comm-slot">
                                <span>${dayName} de ${slot.startTime} a ${slot.endTime}</span>
                                ${classroomInfo}
                            </div>
                        </div>
                    `;
                }).join('');

                card.innerHTML = `
                    <div class="detail-comm-name">${comm.name}</div>
                    <div style="margin-top: 0.25rem;">
                        ${slotsHTML}
                    </div>
                `;
                commissionsList.appendChild(card);
            });
        }

        officialDetail.classList.remove('hidden');
        if (addOfficialSubjectBtn) addOfficialSubjectBtn.disabled = false;
    }

    // 4. Acción de Añadir Materia Oficial
    if (addOfficialSubjectBtn) {
        addOfficialSubjectBtn.addEventListener('click', () => {
            if (!selectedOfficialSubject) return;

            const exists = state.subjects.some(s => s.id === selectedOfficialSubject.id);
            if (exists) {
                alert('Esta materia ya ha sido agregada a tu lista.');
                return;
            }

            const colorHue = generateColorHue();
            const newSub = {
                id: selectedOfficialSubject.id,
                name: selectedOfficialSubject.name,
                colorHue: colorHue,
                isOfficial: true,
                plan: selectedOfficialSubject.plan,
                commissions: selectedOfficialSubject.commissions
            };

            state.subjects.push(newSub);

            if (newSub.commissions.length > 0) {
                state.selections[newSub.id] = newSub.commissions[0].id;
                checkAndEnableWeekendForSlots(newSub.commissions[0].slots);
            } else {
                state.selections[newSub.id] = 'none';
            }

            saveState();
            renderSubjectsList();
            updateTimetable();
            closeModal();
        });
    }

    // 5. Configurar Cancelar Modal genérico
    document.querySelectorAll('.modal-cancel-btn').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });

    // 6. Botón de Re-Sincronización manual
    const openSyncBtn = document.getElementById('open-sync-btn');
    if (openSyncBtn) {
        openSyncBtn.addEventListener('click', () => {
            syncOfficialSchedules();
        });
    }
}

/* ==========================================================================
   Funciones de Integración con Google Calendar API
   ========================================================================== */

const gcalModal = document.getElementById('gcal-modal');
let tokenClient = null;

function openGCalModal() {
    // Reiniciar UI de estado
    document.getElementById('gcal-status-container').classList.add('hidden');

    // Habilitar los botones de cuatrimestre
    const btnC1 = document.getElementById('btn-cuatrimestre-1');
    const btnC2 = document.getElementById('btn-cuatrimestre-2');
    if (btnC1) btnC1.disabled = false;
    if (btnC2) btnC2.disabled = false;

    gcalModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function closeGCalModal() {
    gcalModal.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

function getFirstOccurrence(startDateStr, targetDayStr) {
    // targetDayStr es '1' (Lunes) a '6' (Sábado)
    const targetDayNum = parseInt(targetDayStr, 10);
    const start = new Date(startDateStr + 'T00:00:00');
    const startDay = start.getDay(); // 0 (Domingo) a 6 (Sábado)

    let daysToAdd = targetDayNum - startDay;
    if (daysToAdd < 0) {
        daysToAdd += 7;
    }

    const result = new Date(start);
    result.setDate(start.getDate() + daysToAdd);
    return result;
}

function formatDateAndTime(dateObj, timeStr) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${timeStr}:00`;
}

function getGoogleColorId(hue) {
    // Convierte el tono HSL (0-360) a los IDs de color de Google Calendar (1-11)
    if (hue >= 340 || hue < 20) return "11"; // Rojo (Tomato)
    if (hue >= 20 && hue < 50) return "6";   // Naranja (Tangerine)
    if (hue >= 50 && hue < 80) return "5";   // Amarillo (Banana)
    if (hue >= 80 && hue < 140) return "10";  // Verde oscuro (Basil)
    if (hue >= 140 && hue < 170) return "2";  // Verde claro (Sage)
    if (hue >= 170 && hue < 200) return "7";  // Celeste (Peacock)
    if (hue >= 200 && hue < 230) return "9";  // Azul (Blueberry)
    if (hue >= 230 && hue < 260) return "1";  // Lavanda
    if (hue >= 260 && hue < 290) return "3";  // Púrpura (Grape)
    if (hue >= 290 && hue < 340) return "4";  // Rosa (Flamingo)
    return "8"; // Gris (Graphite) como fallback
}

async function executeExportProcess(accessToken, startDate, endDate, updateStatus) {
    // 1. Recopilar materias/comisiones activas seleccionadas
    const activeSlots = [];
    state.subjects.forEach(subject => {
        const selectedId = state.selections[subject.id];
        if (selectedId && selectedId !== 'none') {
            const commission = subject.commissions.find(c => c.id === selectedId);
            if (commission) {
                commission.slots.forEach(slot => {
                    activeSlots.push({
                        subjectName: subject.name,
                        commissionName: commission.name,
                        colorHue: subject.colorHue,
                        day: slot.day,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        classroom: slot.classroom || '',
                        teacher: slot.teacher || ''
                    });
                });
            }
        }
    });

    if (activeSlots.length === 0) {
        throw new Error('No tenés materias con comisión seleccionada. Seleccioná alguna comisión en el panel izquierdo primero.');
    }

    // 2. Buscar calendarios anteriores
    updateStatus('Buscando calendarios anteriores...');
    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!listRes.ok) {
        const err = await listRes.json().catch(() => ({}));
        throw new Error('No se pudo acceder a tu lista de calendarios: ' + (err.error?.message || listRes.statusText));
    }

    const listData = await listRes.json();
    const existingCalendars = listData.items || [];
    const calendarsToDelete = existingCalendars.filter(cal => cal.summary === 'Horarios UTN');

    // 3. Eliminar calendarios anteriores duplicados
    if (calendarsToDelete.length > 0) {
        updateStatus(`Limpiando ${calendarsToDelete.length} calendario(s) anterior(es)...`);
        for (const cal of calendarsToDelete) {
            const delRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            if (!delRes.ok) {
                console.warn(`No se pudo eliminar el calendario anterior: ${cal.id}`);
            }
        }
    }

    // 4. Crear nuevo calendario
    updateStatus('Creando calendario nuevo...');
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires';
    const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            summary: 'Horarios UTN',
            description: 'Calendario creado automaticamente',
            timeZone: userTimeZone
        })
    });

    if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error('No se pudo crear el nuevo calendario: ' + (err.error?.message || createRes.statusText));
    }

    const newCalendar = await createRes.json();
    const newCalendarId = newCalendar.id;

    // 5. Insertar eventos recurrentes con su color correspondiente
    const dayCodes = { '1': 'MO', '2': 'TU', '3': 'WE', '4': 'TH', '5': 'FR', '6': 'SA' };
    const untilFormatted = endDate.replace(/-/g, '') + 'T235959Z';

    for (let i = 0; i < activeSlots.length; i++) {
        const slot = activeSlots[i];
        updateStatus(`Exportando materia ${i + 1} de ${activeSlots.length}: ${slot.subjectName}...`);

        const firstOccurrence = getFirstOccurrence(startDate, slot.day);
        const startDateTime = formatDateAndTime(firstOccurrence, slot.startTime);
        const endDateTime = formatDateAndTime(firstOccurrence, slot.endTime);
        const byDay = dayCodes[slot.day];
        const recurrenceRule = `RRULE:FREQ=WEEKLY;UNTIL=${untilFormatted};BYDAY=${byDay}`;

        const eventBody = {
            summary: `${slot.subjectName} (${slot.commissionName})`,
            location: slot.classroom || '',
            description: `Materia: ${slot.subjectName}\nComisión: ${slot.commissionName}\nDocente: ${slot.teacher || 'No especificado'}`,
            colorId: getGoogleColorId(slot.colorHue),
            start: {
                dateTime: startDateTime,
                timeZone: userTimeZone
            },
            end: {
                dateTime: endDateTime,
                timeZone: userTimeZone
            },
            recurrence: [
                recurrenceRule
            ]
        };

        const eventRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${newCalendarId}/events`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventBody)
        });

        if (!eventRes.ok) {
            const err = await eventRes.json().catch(() => ({}));
            throw new Error(`Error al exportar la materia ${slot.subjectName}: ` + (err.error?.message || eventRes.statusText));
        }
    }

    updateStatus('¡Exportación completada con éxito!');

    // Cerrar el modal automáticamente tras 2 segundos
    setTimeout(() => {
        closeGCalModal();
    }, 2000);
}

function startGoogleCalendarExport(clientId, startDate, endDate) {
    const statusContainer = document.getElementById('gcal-status-container');
    const statusText = document.getElementById('gcal-status-text');
    const btnC1 = document.getElementById('btn-cuatrimestre-1');
    const btnC2 = document.getElementById('btn-cuatrimestre-2');

    function updateStatus(text, isError = false) {
        statusContainer.classList.remove('hidden');
        statusText.innerText = text;
        if (isError) {
            statusContainer.style.backgroundColor = 'var(--color-danger-light)';
            statusContainer.style.color = 'var(--color-danger)';
            statusContainer.style.borderColor = 'var(--color-danger-border)';
            if (btnC1) btnC1.disabled = false;
            if (btnC2) btnC2.disabled = false;
        } else {
            statusContainer.style.backgroundColor = 'var(--color-brand-light)';
            statusContainer.style.color = 'var(--color-brand)';
            statusContainer.style.borderColor = 'rgba(59, 130, 246, 0.2)';
        }
    }

    try {
        if (btnC1) btnC1.disabled = true;
        if (btnC2) btnC2.disabled = true;
        updateStatus('Iniciando sesión con Google...');

        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            throw new Error('La librería Google Identity Services no está cargada. Verificá tu conexión a internet o si hay extensiones bloqueadoras (ej. uBlock/AdBlock).');
        }

        // Crear TokenClient de Google Identity Services
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/calendar',
            callback: async (tokenResponse) => {
                if (tokenResponse.error) {
                    updateStatus('Error de Google OAuth: ' + tokenResponse.error, true);
                    return;
                }

                try {
                    const accessToken = tokenResponse.access_token;
                    await executeExportProcess(accessToken, startDate, endDate, updateStatus);
                } catch (err) {
                    console.error(err);
                    updateStatus(err.message || 'Error inesperado durante la exportación.', true);
                }
            },
            error_callback: (err) => {
                updateStatus('Error al autenticar: ' + (err.message || err), true);
            }
        });

        // Lanzar popup de consentimiento
        tokenClient.requestAccessToken({ prompt: 'consent' });

    } catch (err) {
        console.error(err);
        updateStatus(err.message || 'Error al iniciar la exportación.', true);
    }
}

function initGoogleCalendarFeatures() {
    const exportBtn = document.getElementById('export-gcal-btn');
    const closeBtn = document.getElementById('gcal-close-btn');
    const cancelBtn = document.getElementById('gcal-cancel-btn');
    const btnC1 = document.getElementById('btn-cuatrimestre-1');
    const btnC2 = document.getElementById('btn-cuatrimestre-2');

    if (exportBtn) exportBtn.addEventListener('click', openGCalModal);
    if (closeBtn) closeBtn.addEventListener('click', closeGCalModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeGCalModal);

    if (gcalModal) {
        gcalModal.addEventListener('click', (e) => {
            if (e.target === gcalModal) {
                closeGCalModal();
            }
        });
    }

    const clientId = '613985898141-g1md59mujg2nisv4dpnn0ld3lt1g60s3.apps.googleusercontent.com';

    if (btnC1) {
        btnC1.addEventListener('click', () => {
            startGoogleCalendarExport(clientId, '2026-03-16', '2026-07-03');
        });
    }

    if (btnC2) {
        btnC2.addEventListener('click', () => {
            startGoogleCalendarExport(clientId, '2026-08-18', '2026-12-04');
        });
    }
}

function initPdfExportFeature() {
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    const pdfModal = document.getElementById('pdf-modal');
    const pdfCloseBtn = document.getElementById('pdf-close-btn');
    const pdfLandscapeBtn = document.getElementById('pdf-landscape-btn');
    const pdfPortraitBtn = document.getElementById('pdf-portrait-btn');

    function openPdfModal() {
        if (pdfModal) {
            pdfModal.classList.remove('hidden');
            document.body.classList.add('modal-open');
        }
    }

    function closePdfModal() {
        if (pdfModal) {
            pdfModal.classList.add('hidden');
            document.body.classList.remove('modal-open');
        }
    }

    function triggerPrint(orientation) {
        closePdfModal();
        document.body.classList.remove('print-landscape', 'print-portrait');
        document.body.classList.add(orientation === 'portrait' ? 'print-portrait' : 'print-landscape');

        setTimeout(() => {
            window.print();
        }, 150);
    }

    if (exportPdfBtn) exportPdfBtn.addEventListener('click', openPdfModal);
    if (pdfCloseBtn) pdfCloseBtn.addEventListener('click', closePdfModal);
    if (pdfLandscapeBtn) pdfLandscapeBtn.addEventListener('click', () => triggerPrint('landscape'));
    if (pdfPortraitBtn) pdfPortraitBtn.addEventListener('click', () => triggerPrint('portrait'));

    if (pdfModal) {
        pdfModal.addEventListener('click', (e) => {
            if (e.target === pdfModal) {
                closePdfModal();
            }
        });
    }
}

// Inicializar Aplicación al Cargar
window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTableSize();
    loadState();
    initSyncAndSearchFeatures();
    initGoogleCalendarFeatures();
    initPdfExportFeature();
    renderGridStructure();
    renderSubjectsList();
    updateTimetable();

    // Auto-sincronizar horarios oficiales desde GitHub
    syncOfficialSchedules();
});

