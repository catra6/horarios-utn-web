/* ==========================================================================
   HoraUni - Lógica de la Aplicación (JavaScript Vanilla)
   ========================================================================== */

// 1. Estado de la Aplicación
let state = {
    subjects: [],   // Formato: { id, name, colorHue, isOfficial, plan, commissions: [ { id, name, slots: [ { day, startTime, endTime, classroom, teacher, term } ] } ] }
    selections: {},  // Formato: { [subjectId]: commissionId }
    collapsed: {},   // Formato: { [subjectId]: true/false }
    officialSubjects: [], // Base de datos de materias oficiales sincronizadas
    officialUpdate: null  // Fecha/hora de última sincronización
};

// 2. Datos de Ejemplo (Se cargan si localStorage está vacío)
const SAMPLE_SUBJECTS = [
    {
        id: 's_sample_fisica',
        name: 'Física General I',
        colorHue: 205, // Celeste pastel
        commissions: [
            {
                id: 'c_fisica_c1',
                name: 'Comisión 1 (Mañana)',
                slots: [
                    { day: '1', startTime: '08:30', endTime: '11:00' }, // Lunes
                    { day: '3', startTime: '08:30', endTime: '11:00' }  // Miércoles
                ]
            },
            {
                id: 'c_fisica_c2',
                name: 'Comisión 2 (Tarde)',
                slots: [
                    { day: '2', startTime: '14:00', endTime: '16:30' }, // Martes
                    { day: '4', startTime: '14:00', endTime: '16:30' }  // Jueves
                ]
            }
        ]
    },
    {
        id: 's_sample_algebra',
        name: 'Álgebra Lineal',
        colorHue: 35, // Naranja pastel
        commissions: [
            {
                id: 'c_algebra_c1',
                name: 'Comisión Única',
                slots: [
                    { day: '1', startTime: '10:00', endTime: '13:00' }, // Lunes (provoca colisión con Física C1 de 10:00 a 11:00)
                    { day: '4', startTime: '10:00', endTime: '13:00' }  // Jueves
                ]
            },
            {
                id: 'c_algebra_alt',
                name: 'Comisión Alternativa',
                slots: [
                    { day: '5', startTime: '08:30', endTime: '11:30' }  // Viernes
                ]
            }
        ]
    },
    {
        id: 's_sample_prog',
        name: 'Introducción a la Programación',
        colorHue: 120, // Verde pastel
        commissions: [
            {
                id: 'c_prog_c1',
                name: 'Comisión Noche',
                slots: [
                    { day: '2', startTime: '18:00', endTime: '21:00' }  // Martes
                ]
            },
            {
                id: 'c_prog_c2',
                name: 'Comisión Tarde',
                slots: [
                    { day: '3', startTime: '14:00', endTime: '17:00' }  // Miércoles
                ]
            }
        ]
    }
];

const SAMPLE_SELECTIONS = {
    's_sample_fisica': 'c_fisica_c1',
    's_sample_algebra': 'c_algebra_c1',
    's_sample_prog': 'c_prog_c2'
};

// 3. Inicialización del Tema
function initTheme() {
    const savedTheme = localStorage.getItem('horauni_theme');
    if (savedTheme === 'dark') {
        document.body.className = 'theme-dark';
    } else if (savedTheme === 'light') {
        document.body.className = 'theme-light';
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.className = prefersDark ? 'theme-dark' : 'theme-light';
    }
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
            state.collapsed = parsed.collapsed || {};
        } catch (e) {
            console.error('Error al cargar datos guardados, usando valores por defecto.', e);
            loadSampleData();
        }
    } else {
        loadSampleData();
    }
    loadOfficialState(); // Cargar base de datos oficial
}

function loadSampleData() {
    state.subjects = JSON.parse(JSON.stringify(SAMPLE_SUBJECTS));
    state.selections = JSON.parse(JSON.stringify(SAMPLE_SELECTIONS));
    state.collapsed = {};
    saveState();
}

function saveState() {
    const stateToSave = {
        subjects: state.subjects,
        selections: state.selections,
        collapsed: state.collapsed || {}
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

function updateSyncStatusUI() {
    const syncStatusText = document.getElementById('sync-status-text');
    const syncBtn = document.getElementById('open-sync-btn');

    if (!syncStatusText) return;

    const text = state.officialUpdate
        ? `Sync: ${state.officialUpdate}`
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
    state.officialUpdate = new Date().toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

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
                ? `Sync: ${state.officialUpdate} (error al actualizar)`
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
    const rows = [];

    trs.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 7) {
            const timeSlotText = tds[0].textContent.replace(/\s+/g, '').trim();
            // Match time pattern e.g. "08:00-08:45"
            if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(timeSlotText)) {
                const dayCells = [];
                for (let i = 1; i < 7; i++) {
                    dayCells.push(tds[i].textContent.trim());
                }
                rows.push({
                    timeSlot: timeSlotText,
                    cells: dayCells
                });
            }
        }
    });

    const parsedSubjects = {};
    // Regex para extraer todos los campos: Nombre, Plan, Comisión, Cuatrimestre, Docente, Aula (opcional), Horas
    const entryRegex = /^([\s\S]+?)\(\s*(\d+)\s*\)\s*-\s*Com:\s*([^-]+)-\s*\(([^)]+)\)\s*-\s*\(([^)]+)\)(?:\s*(?:\*\*|\s)*\((AULA\s+[^)]+)\)(?:\*\*|\s)*)?\s*\((\d{2}:\d{2})-(\d{2}:\d{2})\)$/i;

    rows.forEach(row => {
        row.cells.forEach((cellText, dayIdx) => {
            if (!cellText || cellText.trim() === '') return;

            // Reemplazar saltos de línea y múltiples espacios por un único espacio
            const text = cellText.replace(/\s+/g, ' ').trim();
            const match = text.match(entryRegex);

            if (match) {
                const subjectName = match[1].trim();
                const plan = match[2].trim();
                const commission = match[3].trim();
                const term = match[4].trim();
                const teacher = match[5].trim();
                const classroom = match[6] ? match[6].trim() : '';
                const startTime = match[7].trim();
                const endTime = match[8].trim();

                const dayVal = (dayIdx + 1).toString(); // '1' = Lunes, '2' = Martes, etc.
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
        });
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

function generateColorHue() {
    // Usamos el ángulo áureo (~137.5 grados) para obtener colores bien distribuidos
    const count = state.subjects.length;
    return Math.floor((count * 137.5) % 360);
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
    ];

    const dayOptions = days.map(d => `<option value="${d.val}" ${day === d.val ? 'selected' : ''}>${d.name}</option>`).join('');

    return `
        <div class="form-slot-row">
            <select class="slot-day" required>
                ${dayOptions}
            </select>
            <input type="text" class="slot-start" placeholder="Desde (HH:MM)" required value="${startTime}" maxlength="5" pattern="^(0[0-9]|1[0-9]|2[0-4]):[0-5][0-9]$" title="Formato HH:MM de 00:00 a 24:00">
            <input type="text" class="slot-end" placeholder="Hasta (HH:MM)" required value="${endTime}" maxlength="5" pattern="^(0[0-9]|1[0-9]|2[0-4]):[0-5][0-9]$" title="Formato HH:MM de 00:00 a 24:00">
            <button type="button" class="btn-card-action btn-card-delete btn-slot-delete" title="Eliminar Horario">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/>
                </svg>
            </button>
        </div>
    `;
}

function createCommissionCardHTML(commissionId, name = '', slots = []) {
    let slotsHTML = '';
    if (slots.length === 0) {
        slotsHTML = createSlotRowHTML();
    } else {
        slotsHTML = slots.map(slot => createSlotRowHTML(slot.day, slot.startTime, slot.endTime)).join('');
    }

    return `
        <div class="form-commission-card" data-id="${commissionId}">
            <div class="form-commission-header">
                <div class="form-group" style="flex: 1; margin: 0;">
                    <input type="text" class="form-commission-name" placeholder="Nombre de Comisión (ej. Comisión A, Noche...)" required value="${name}">
                </div>
                <button type="button" class="btn btn-danger btn-small btn-card-action btn-commission-delete" title="Eliminar Comisión">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/>
                    </svg>
                </button>
            </div>
            <div class="commission-slots-list">
                ${slotsHTML}
            </div>
            <button type="button" class="btn btn-secondary btn-small btn-icon-text btn-add-slot-row" style="margin-top: 0.5rem; align-self: flex-start;">
                <svg viewBox="0 0 24 24" width="12" height="12">
                    <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z"/>
                </svg>
                <span>Añadir Horario</span>
            </button>
        </div>
    `;
}

// 7. Renderizar la grilla de fondo (Timetable Grid Structure)
const gridContainer = document.getElementById('timetable-grid');

function renderGridStructure() {
    gridContainer.innerHTML = '';

    // Cabecera superior izquierda (Hora)
    const timeHeader = document.createElement('div');
    timeHeader.className = 'grid-header grid-header-time';
    timeHeader.innerText = 'Hora';
    gridContainer.appendChild(timeHeader);

    // Cabeceras de días (Lunes a Sabado, columnas 2 a 8)
    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    dayNames.forEach((dayName, idx) => {
        const header = document.createElement('div');
        header.className = 'grid-header';
        header.style.gridRow = '1';
        header.style.gridColumn = `${idx + 2}`;
        header.innerText = dayName;
        gridContainer.appendChild(header);
    });

    // Bloques horarios (08:00 a 00:00, filas 2 a 33)
    const startHour = 8;
    const endHour = 24;
    const totalSlots = (endHour - startHour) * 2;

    for (let slot = 0; slot < totalSlots; slot++) {
        const startRow = slot * 30 + 2;
        const endRow = (slot + 1) * 30 + 2;

        // Etiqueta de la hora
        const hour = Math.floor(startHour + slot / 2);
        const mins = slot % 2 === 0 ? '00' : '30';

        const timeLabel = document.createElement('div');
        timeLabel.className = 'time-label';
        timeLabel.style.gridRow = `${startRow} / ${endRow}`;
        timeLabel.style.gridColumn = '1';
        timeLabel.innerText = `${String(hour).padStart(2, '0')}:${mins}`;
        gridContainer.appendChild(timeLabel);

        // Celdas de fondo para cada día
        for (let day = 1; day <= 6; day++) {
            const cell = document.createElement('div');
            const isHourStart = slot % 2 === 0;
            cell.className = `grid-cell ${isHourStart ? 'hour-start' : 'half-hour-start'}`;
            cell.style.gridRow = `${startRow} / ${endRow}`;
            cell.style.gridColumn = `${day + 1}`;
            gridContainer.appendChild(cell);
        }
    }
}

// 8. Renderizar la Sidebar (Control de Materias)
const subjectsContainer = document.getElementById('subjects-container');

function renderSubjectsList() {
    subjectsContainer.innerHTML = '';

    if (state.subjects.length === 0) {
        subjectsContainer.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" width="48" height="48">
                    <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z"/>
                </svg>
                <p>No tienes materias cargadas aún.</p>
                <p class="subtext">Haz clic en "Añadir materia" para comenzar.</p>
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

        const isCollapsed = state.collapsed[subject.id] || false;
        toggleBtn.innerHTML = `
            <svg class="icon-chevron ${isCollapsed ? 'collapsed' : ''}" viewBox="0 0 24 24" width="16" height="16">
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
        }

        header.appendChild(title);

        const actions = document.createElement('div');
        actions.className = 'subject-card-actions';

        // Editar - Solo si NO es oficial
        if (!subject.isOfficial) {
            const editBtn = document.createElement('button');
            editBtn.className = 'btn-card-action';
            editBtn.title = 'Editar materia';
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

        // Contenedor de Comisiones
        const commContainer = document.createElement('div');
        commContainer.className = 'subject-card-commissions';
        if (isCollapsed) {
            commContainer.classList.add('hidden');
        }

        // Configurar evento de toggle al hacer clic en la cabecera (excluyendo los botones de editar/eliminar)
        header.addEventListener('click', (e) => {
            if (e.target.closest('.btn-card-action')) return;

            const nowCollapsed = !commContainer.classList.contains('hidden');
            if (nowCollapsed) {
                commContainer.classList.add('hidden');
                toggleBtn.querySelector('svg').classList.add('collapsed');
                state.collapsed[subject.id] = true;
            } else {
                commContainer.classList.remove('hidden');
                toggleBtn.querySelector('svg').classList.remove('collapsed');
                delete state.collapsed[subject.id];
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
        commContainer.appendChild(noneOption);

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
            commContainer.appendChild(label);
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

function selectCommission(subjectId, commissionId) {
    state.selections[subjectId] = commissionId;
    saveState();
    updateTimetable();
}

// 9. Actualizar la Grilla Horaria y Colisiones en Tiempo Real
const collisionPanel = document.getElementById('collision-panel');
const collisionList = document.getElementById('collision-list');

function updateTimetable() {
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
                    const startSlot = timeStrToSlotIndex(slot.startTime);
                    const endSlot = timeStrToSlotIndex(slot.endTime);
                    activeSlots.push({
                        subjectId: subject.id,
                        subjectName: subject.name,
                        colorHue: subject.colorHue,
                        commissionId: commission.id,
                        commissionName: commission.name,
                        day: slot.day,
                        startSlot: startSlot,
                        endSlot: endSlot,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        classroom: slot.classroom || '',
                        teacher: slot.teacher || ''
                    });
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

            // Colisionan si es el mismo día y los rangos de slots se solapan
            if (a.day === b.day && Math.max(a.startSlot, b.startSlot) < Math.min(a.endSlot, b.endSlot)) {
                const overlapStart = Math.max(a.startSlot, b.startSlot);
                const overlapEnd = Math.min(a.endSlot, b.endSlot);

                collisions.push({
                    day: a.day,
                    slotA: a,
                    slotB: b,
                    overlapStart: overlapStart,
                    overlapEnd: overlapEnd
                });

                // Claves únicas para identificar qué bloques específicos pintar en rojo
                conflictingSlotKeys.add(`${a.subjectId}_${a.commissionId}_${a.day}_${a.startSlot}_${a.endSlot}`);
                conflictingSlotKeys.add(`${b.subjectId}_${b.commissionId}_${b.day}_${b.startSlot}_${b.endSlot}`);
            }
        }
    }

    // D. Renderizar los Eventos Activos
    activeSlots.forEach(slot => {
        const eventEl = document.createElement('div');
        const slotKey = `${slot.subjectId}_${slot.commissionId}_${slot.day}_${slot.startSlot}_${slot.endSlot}`;
        const isConflicting = conflictingSlotKeys.has(slotKey);

        eventEl.className = `timetable-event ${isConflicting ? 'in-conflict' : ''}`;

        // Posicionamiento en el CSS Grid
        eventEl.style.gridRow = `${slot.startSlot + 2} / ${slot.endSlot + 2}`;
        eventEl.style.gridColumn = `${Number(slot.day) + 1}`; // Col 1 es Hora, por ende Lunes (1) es Col 2

        eventEl.style.setProperty('--subject-color-hue', slot.colorHue);

        const classroomHTML = slot.classroom ? `<div class="event-classroom" title="${slot.classroom}">${slot.classroom}</div>` : '';
        const teacherHTML = slot.teacher ? `<div class="event-teacher" title="${slot.teacher}">${slot.teacher}</div>` : '';

        // Contenido
        eventEl.innerHTML = `
            <div class="event-subject" title="${slot.subjectName}">${slot.subjectName}</div>
            <div class="event-commission" title="${slot.commissionName}">${slot.commissionName}</div>
            ${classroomHTML}
            ${teacherHTML}
            <div class="event-time">${slot.startTime} - ${slot.endTime}</div>
        `;

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

// 10. Gestión del Modal
const subjectModal = document.getElementById('subject-modal');
const subjectForm = document.getElementById('subject-form');
const commissionsFormList = document.getElementById('commissions-form-list');
const editSubjectIdInput = document.getElementById('edit-subject-id');

function openAddSubjectModal() {
    document.getElementById('modal-title').innerText = 'Añadir materia';
    editSubjectIdInput.value = '';
    subjectForm.reset();

    commissionsFormList.innerHTML = '';

    // Por defecto, añadir una comisión inicial
    const commissionId = 'c_' + Date.now();
    const cardHTML = createCommissionCardHTML(commissionId, 'Comisión 1');
    commissionsFormList.appendChild(htmlToElement(cardHTML));

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

    document.getElementById('modal-title').innerText = 'Editar materia';
    editSubjectIdInput.value = subject.id;
    document.getElementById('subject-name').value = subject.name;

    commissionsFormList.innerHTML = '';

    subject.commissions.forEach(comm => {
        const cardHTML = createCommissionCardHTML(comm.id, comm.name, comm.slots);
        commissionsFormList.appendChild(htmlToElement(cardHTML));
    });

    // Si editamos, ocultar las pestañas para no permitir cambio a búsqueda
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
}

// Escuchador del formulario del modal (Delegación de Eventos)
commissionsFormList.addEventListener('click', async (e) => {
    const deleteCommBtn = e.target.closest('.btn-commission-delete');
    const deleteSlotBtn = e.target.closest('.btn-slot-delete');
    const addSlotBtn = e.target.closest('.btn-add-slot-row');

    if (deleteCommBtn) {
        const card = deleteCommBtn.closest('.form-commission-card');
        const confirmed = await showConfirm('¿Estás seguro de que deseas eliminar esta comisión y todos sus horarios?');
        if (confirmed) {
            card.remove();
        }
    } else if (deleteSlotBtn) {
        const row = deleteSlotBtn.closest('.form-slot-row');
        const slotsList = row.parentElement;
        if (slotsList.children.length > 1) {
            const confirmed = await showConfirm('¿Estás seguro de que deseas eliminar este horario?');
            if (confirmed) {
                row.remove();
            }
        } else {
            alert('Cada comisión debe contar con al menos un horario.');
        }
    } else if (addSlotBtn) {
        const card = addSlotBtn.closest('.form-commission-card');
        const slotsList = card.querySelector('.commission-slots-list');
        const newSlotHTML = createSlotRowHTML();
        slotsList.appendChild(htmlToElement(newSlotHTML));
    }
});

// Añadir comisión vacía al modal
document.getElementById('add-commission-btn').addEventListener('click', () => {
    const commissionId = 'c_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const count = commissionsFormList.querySelectorAll('.form-commission-card').length;
    const cardHTML = createCommissionCardHTML(commissionId, `Comisión ${count + 1}`);
    commissionsFormList.appendChild(htmlToElement(cardHTML));

    // Hacer scroll al fondo de la vista del modal
    const modalBody = subjectModal.querySelector('.modal-body');
    modalBody.scrollTop = modalBody.scrollHeight;
});

// Guardar materia en el Submit del modal
subjectForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const subjectId = editSubjectIdInput.value;
    const subjectName = document.getElementById('subject-name').value.trim();

    const commissionCards = commissionsFormList.querySelectorAll('.form-commission-card');
    if (commissionCards.length === 0) {
        alert('Debes añadir al menos una comisión.');
        return;
    }

    const commissions = [];
    let isValid = true;

    commissionCards.forEach(card => {
        const commissionId = card.getAttribute('data-id');
        const commissionName = card.querySelector('.form-commission-name').value.trim();

        const slotRows = card.querySelectorAll('.form-slot-row');
        const slots = [];

        slotRows.forEach(row => {
            const day = row.querySelector('.slot-day').value;
            const startTime = row.querySelector('.slot-start').value;
            const endTime = row.querySelector('.slot-end').value;

            // Validación de rango
            const startMins = timeStrToMinutes(startTime);
            const endMins = timeStrToMinutes(endTime);

            if (endMins <= startMins) {
                alert(`Error en "${commissionName}": La hora de fin (${endTime}) debe ser estrictamente posterior a la de inicio (${startTime}).`);
                isValid = false;
            }

            slots.push({ day, startTime, endTime });
        });

        commissions.push({ id: commissionId, name: commissionName, slots });
    });

    if (!isValid) return; // Detener guardado si hay error en horas

    if (subjectId) {
        // Modo Edición
        const subIndex = state.subjects.findIndex(s => s.id === subjectId);
        if (subIndex > -1) {
            state.subjects[subIndex].name = subjectName;
            state.subjects[subIndex].commissions = commissions;

            // Si la comisión previamente seleccionada ya no existe, resetearla
            const currentSelection = state.selections[subjectId];
            const selectionExists = commissions.some(c => c.id === currentSelection);
            if (!selectionExists) {
                state.selections[subjectId] = commissions[0].id;
            }
        }
    } else {
        // Modo Creación
        const newSubjectId = 's_' + Date.now();
        const colorHue = generateColorHue();

        state.subjects.push({
            id: newSubjectId,
            name: subjectName,
            colorHue: colorHue,
            commissions: commissions
        });

        // Auto-seleccionar la primera comisión por defecto
        state.selections[newSubjectId] = commissions[0].id;
    }

    saveState();
    renderSubjectsList();
    updateTimetable();
    closeModal();
});

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
document.getElementById('modal-close-btn').addEventListener('click', closeModal);
subjectModal.addEventListener('click', (e) => {
    if (e.target === subjectModal) {
        closeModal();
    }
});

// 11. Acciones de Encabezado y Otros Botones
document.getElementById('add-subject-btn').addEventListener('click', openAddSubjectModal);

document.getElementById('theme-toggle').addEventListener('click', () => {
    if (document.body.classList.contains('theme-dark')) {
        document.body.className = 'theme-light';
        localStorage.setItem('horauni_theme', 'light');
    } else {
        document.body.className = 'theme-dark';
        localStorage.setItem('horauni_theme', 'dark');
    }
});

document.getElementById('clear-data-btn').addEventListener('click', async () => {
    const confirmed = await showConfirm('¿Estás seguro de que deseas borrar todos los datos y reiniciar? Esta acción no se puede deshacer.');
    if (confirmed) {
        state.subjects = [];
        state.selections = {};
        saveState();
        renderSubjectsList();
        updateTimetable();
    }
});

function initTableSize() {
    const savedSize = localStorage.getItem('horauni_tablesize') || 'normal';
    const grid = document.getElementById('timetable-grid');
    grid.setAttribute('data-size', savedSize);

    document.querySelectorAll('#zoom-controls button').forEach(btn => {
        btn.classList.remove('active');
    });

    const activeBtn = document.getElementById(`zoom-${savedSize}-btn`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

document.getElementById('zoom-controls').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    let size = 'normal';
    if (btn.id === 'zoom-compact-btn') size = 'compact';
    else if (btn.id === 'zoom-spacious-btn') size = 'spacious';

    const grid = document.getElementById('timetable-grid');
    grid.setAttribute('data-size', size);
    localStorage.setItem('horauni_tablesize', size);

    document.querySelectorAll('#zoom-controls button').forEach(b => {
        b.classList.remove('active');
    });
    btn.classList.add('active');
});

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

// Inicializar Aplicación al Cargar
window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTableSize();
    loadState();
    initSyncAndSearchFeatures();
    renderGridStructure();
    renderSubjectsList();
    updateTimetable();

    // Auto-sincronizar horarios oficiales desde GitHub
    syncOfficialSchedules();
});
