// ============================================
// CONFIGURACIÓN
// ============================================
const CONFIG = {
    // URL que aparece en el pie de página al imprimir
    footerUrl: 'https://aramcap.github.io/colorcal/'
};

// ============================================
// FUNCIONES DE TEMA
// ============================================

// Aplicar tema según preferencia
function applyTheme(theme) {
    if (theme === 'system') {
        // Usar preferencia del sistema
        document.documentElement.removeAttribute('data-theme');
    } else {
        // Forzar tema claro u oscuro
        document.documentElement.setAttribute('data-theme', theme);
    }
    
    // Guardar preferencia
    localStorage.setItem('colorcal-theme', theme);
    
    // Actualizar selector
    const selector = document.getElementById('themeSelector');
    if (selector) {
        selector.value = theme;
    }
    
    // Re-renderizar calendario si existe
    if (state.chart) {
        // Pequeño delay para permitir que los estilos CSS se apliquen
        setTimeout(() => {
            renderCalendar();
        }, 50);
    }
}

// Cargar tema guardado
function loadTheme() {
    const savedTheme = localStorage.getItem('colorcal-theme') || 'system';
    applyTheme(savedTheme);
    
    // Escuchar cambios en la preferencia del sistema
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const currentTheme = localStorage.getItem('colorcal-theme') || 'system';
        if (currentTheme === 'system' && state.chart) {
            // Re-renderizar calendario cuando cambia el tema del sistema
            setTimeout(() => {
                renderCalendar();
            }, 50);
        }
    });
}

// Obtener colores actuales del tema
function getThemeColors() {
    // Si estamos en modo impresión, forzar colores claros
    if (state.isPrinting) {
        return getLightThemeColors();
    }
    const computedStyle = getComputedStyle(document.documentElement);
    return {
        bgPrimary: computedStyle.getPropertyValue('--bg-primary').trim() || '#f5f5f5',
        bgSecondary: computedStyle.getPropertyValue('--bg-secondary').trim() || '#ffffff',
        bgSidebarItem: computedStyle.getPropertyValue('--bg-sidebar-item').trim() || '#34495e',
        textPrimary: computedStyle.getPropertyValue('--text-primary').trim() || '#333333',
        textSecondary: computedStyle.getPropertyValue('--text-secondary').trim() || '#666666',
        textMuted: computedStyle.getPropertyValue('--text-muted').trim() || '#95a5a6',
        borderColor: computedStyle.getPropertyValue('--border-color').trim() || '#ddd',
        accentPrimary: computedStyle.getPropertyValue('--accent-primary').trim() || '#3498db'
    };
}

// Obtener colores del tema claro (para impresión)
function getLightThemeColors() {
    return {
        bgPrimary: '#f5f5f5',
        bgSecondary: '#ffffff',
        bgSidebarItem: '#34495e',
        textPrimary: '#333333',
        textSecondary: '#666666',
        textMuted: '#95a5a6',
        borderColor: '#ddd',
        accentPrimary: '#3498db'
    };
}

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================

// Modos de conteo de un período
const COUNT_MODE_NATURAL = 'natural';   // todos los días del rango
const COUNT_MODE_BUSINESS = 'business'; // solo de lunes a viernes

// Interpreta 'YYYY-MM-DD' en horario local. new Date('YYYY-MM-DD') lo parsea como
// UTC y desplaza el día en husos al oeste de Greenwich, lo que descuadraría el
// cálculo de fines de semana respecto a lo que se pinta en el calendario.
function parseLocalDate(dateStr) {
    const [year, month, day] = String(dateStr).split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Sábado o domingo
function isWeekendDate(date) {
    const dayOfWeek = date.getDay(); // 0=Dom, 6=Sáb
    return dayOfWeek === 0 || dayOfWeek === 6;
}

function normalizeCountMode(value) {
    return value === COUNT_MODE_BUSINESS ? COUNT_MODE_BUSINESS : COUNT_MODE_NATURAL;
}

// Los períodos guardados antes de existir esta opción se consideran naturales.
// Los de la etiqueta reservada lo son siempre: si contasen en modo laborable se
// excluirían a sí mismos, porque sus días son justo los que hay que descartar.
function resolveCountMode(tagId, countMode) {
    return isHolidayTag(tagId) ? COUNT_MODE_NATURAL : normalizeCountMode(countMode);
}

function normalizePeriods(raw) {
    return (raw || []).map(period => ({
        ...period,
        countMode: resolveCountMode(period.tagId, period.countMode),
        label: period.label ? String(period.label) : ''
    }));
}

// Convierte el formato antiguo (state.holidays) en períodos de la etiqueta
// reservada. Se ejecuta al cargar y al importar, una sola vez por conjunto de datos.
function migrateLegacyHolidays(rawHolidays, rawHolidayColor) {
    const porFecha = new Map();
    (rawHolidays || []).forEach(item => {
        const date = typeof item === 'string' ? item : (item && item.date);
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const name = (typeof item === 'object' && item && item.name ? String(item.name) : '').trim();
        porFecha.set(date, name);
    });

    if (porFecha.size === 0) return;

    const tag = ensureHolidayTag();
    if (rawHolidayColor) tag.color = rawHolidayColor;

    [...porFecha.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([date, name], index) => {
            const period = {
                id: `period_legacy_${index}_${date}`,
                tagId: tag.id,
                startDate: date,
                endDate: date,
                tagName: tag.name,
                tagColor: tag.color,
                countMode: COUNT_MODE_NATURAL,
                label: name
            };
            state.periods.push(period);
            applyPeriodMarks(period);
        });
}

// Escapa texto que se inserta como HTML (los nombres pueden venir de un JSON importado)
function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

// Los festivos son una etiqueta más, pero reservada: existe siempre, no se puede
// eliminar ni renombrar, y sus días no cuentan como laborables.
const HOLIDAY_TAG_ID = 'tag_holidays';
const HOLIDAY_TAG_NAME = 'Festivos';
const HOLIDAY_TAG_COLOR = '#e74c3c';

function isHolidayTag(tagId) {
    return tagId === HOLIDAY_TAG_ID;
}

// Compara nombres ignorando mayúsculas y acentos, para impedir duplicados
function normalizeTagName(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

// Reapunta a otra etiqueta los períodos y las marcas de una etiqueta que
// desaparece, adoptando el nombre y el color de la superviviente.
// targetTag permite pasar la etiqueta superviviente explícitamente: al fusionar
// durante la carga, state.tags todavía no contiene la lista definitiva.
function reassignTag(fromId, toId, targetTag) {
    if (fromId === toId) return;

    const target = targetTag || state.tags.find(tag => tag.id === toId);

    state.periods.forEach(period => {
        if (period.tagId !== fromId) return;
        period.tagId = toId;
        if (target) {
            period.tagName = target.name;
            period.tagColor = target.color;
        }
    });

    Object.values(state.markedDays).forEach(entries => {
        entries.forEach(entry => {
            if (entry.tagId !== fromId) return;
            entry.tagId = toId;
            if (target) {
                entry.color = target.color;
                entry.name = target.name;
            }
        });
    });
}

// El nombre identifica a la etiqueta, así que unos datos con nombres repetidos
// se fusionan al cargarlos: gana la primera y las demás le ceden sus períodos y
// marcas, en lugar de quedar varias etiquetas indistinguibles en la lista.
function normalizeTags(raw) {
    const porNombre = new Map();
    const resultado = [];

    (raw || []).forEach(tag => {
        if (!tag || !tag.id) return;
        const clave = normalizeTagName(tag.name);
        const previa = porNombre.get(clave);

        if (previa) {
            reassignTag(tag.id, previa.id, previa);
            return;
        }

        porNombre.set(clave, tag);
        resultado.push(tag);
    });

    return resultado;
}

// Garantiza que la etiqueta reservada existe y va la primera de la lista
function ensureHolidayTag() {
    const existing = state.tags.find(tag => tag.id === HOLIDAY_TAG_ID);

    if (existing) {
        existing.name = HOLIDAY_TAG_NAME;
        state.tags = [existing, ...state.tags.filter(tag => tag.id !== HOLIDAY_TAG_ID)];
        return existing;
    }

    // Una etiqueta importada que se llame igual pasa a ser la reservada, para no
    // acabar con dos "Festivos" en la lista
    const sameName = state.tags.find(tag => normalizeTagName(tag.name) === normalizeTagName(HOLIDAY_TAG_NAME));
    if (sameName) {
        const oldId = sameName.id;
        sameName.id = HOLIDAY_TAG_ID;
        sameName.name = HOLIDAY_TAG_NAME;
        reassignTag(oldId, HOLIDAY_TAG_ID, sameName);
        state.tags = [sameName, ...state.tags.filter(tag => tag.id !== HOLIDAY_TAG_ID)];
        return sameName;
    }

    const tag = { id: HOLIDAY_TAG_ID, name: HOLIDAY_TAG_NAME, color: HOLIDAY_TAG_COLOR };
    state.tags = [tag, ...state.tags];
    return tag;
}

function getHolidayTag() {
    return state.tags.find(tag => tag.id === HOLIDAY_TAG_ID);
}

// Un día es festivo si lo marca la etiqueta reservada
function isHolidayDate(dateStr) {
    const entries = state.markedDays[dateStr];
    return Array.isArray(entries) && entries.some(entry => isHolidayTag(entry.tagId));
}

// Días que no cuentan como laborables: fines de semana y festivos
function isNonWorkingDay(date, dateStr) {
    return isWeekendDate(date) || isHolidayDate(dateStr);
}

// Fechas (YYYY-MM-DD) que abarca un período. En modo laborable se descartan los
// fines de semana y los festivos, de modo que ni se marcan en el calendario ni
// se cuentan.
function getPeriodDates(startDateStr, endDateStr, countMode) {
    const dates = [];
    const current = parseLocalDate(startDateStr);
    const end = parseLocalDate(endDateStr);

    while (current <= end) {
        const dateStr = formatDate(current);
        if (countMode !== COUNT_MODE_BUSINESS || !isNonWorkingDay(current, dateStr)) {
            dates.push(dateStr);
        }
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

// Texto del contador de un período, p. ej. "10 laborables" o "12 días"
function formatPeriodCount(period) {
    const total = getPeriodDates(period.startDate, period.endDate, period.countMode).length;
    if (period.countMode === COUNT_MODE_BUSINESS) {
        return total === 1 ? '1 laborable' : `${total} laborables`;
    }
    return total === 1 ? '1 día' : `${total} días`;
}

// ============================================
// COLOR ALEATORIO PARA ETIQUETAS NUEVAS
// ============================================

function hslToHex(hue, saturation, lightness) {
    const s = saturation / 100;
    const l = lightness / 100;
    const k = n => (n + hue / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const canal = n => {
        const valor = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(255 * valor).toString(16).padStart(2, '0');
    };
    return `#${canal(0)}${canal(8)}${canal(4)}`;
}

// Tono de un color, o null si es un gris (que no aporta tono con el que comparar)
function hexToHue(hex) {
    const coincide = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!coincide) return null;

    const valor = parseInt(coincide[1], 16);
    const r = ((valor >> 16) & 255) / 255;
    const g = ((valor >> 8) & 255) / 255;
    const b = (valor & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (delta === 0) return null;

    let hue;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;

    return (Math.round(hue * 60) + 360) % 360;
}

// Separación entre dos tonos en la rueda de color, de 0 a 180
function hueDistance(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

// Color para la siguiente etiqueta. Se generan varios tonos al azar y se queda
// el más alejado de los que ya están en uso, para que dos etiquetas no acaben
// con colores casi iguales. La saturación y la luminosidad van acotadas: en RGB
// puro salen demasiados colores lavados o casi negros, que se distinguen mal en
// el calendario.
function getRandomTagColor() {
    const usados = state.tags
        .map(tag => hexToHue(tag.color))
        .filter(hue => hue !== null);

    let mejorTono = Math.floor(Math.random() * 360);
    let mejorDistancia = -1;

    for (let i = 0; i < 24; i++) {
        const tono = Math.floor(Math.random() * 360);
        const distancia = usados.length
            ? Math.min(...usados.map(usado => hueDistance(usado, tono)))
            : 360;
        if (distancia > mejorDistancia) {
            mejorDistancia = distancia;
            mejorTono = tono;
        }
    }

    return hslToHex(mejorTono, 55 + Math.floor(Math.random() * 20), 42 + Math.floor(Math.random() * 12));
}

// Deja el selector preparado con un color nuevo para la siguiente etiqueta
function refreshTagColorSuggestion() {
    const colorInput = document.getElementById('tagColor');
    if (colorInput) {
        colorInput.value = getRandomTagColor();
    }
}

// Función para calcular luminosidad de un color y determinar si el texto debe ser claro u oscuro
function getContrastColor(hexColor) {
    if (!hexColor) {
        const colors = getThemeColors();
        return colors.textPrimary;
    }
    // Remover # si existe
    const hex = hexColor.replace('#', '');
    // Convertir a RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // Calcular luminosidad relativa (fórmula estándar)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Si el fondo es oscuro, usar texto blanco; si es claro, usar texto oscuro
    return luminance < 0.5 ? '#ffffff' : '#333333';
}

// Obtener el color de fondo predominante para un día (primera etiqueta)
function getDayBackgroundColor(date, markedDays) {
    const tags = markedDays[date];
    if (!tags) return null;
    const tagArray = Array.isArray(tags) ? tags : [tags];
    if (tagArray.length === 0) return null;
    return tagArray[0].color || null;
}

// Estado de la aplicación
const state = {
    tags: [],
    markedDays: {}, // { "2024-01-15": { tagId: "tag1", color: "#3498db", name: "Vacaciones" } }
    periods: [], // { id: "period_123", tagId: "tag1", startDate: "2024-01-15", endDate: "2024-01-20", tagName: "Vacaciones", tagColor: "#3498db", countMode: "natural", label: "" }
    startMonth: null,
    monthsCount: 12,
    chart: null,
    highlightWeekends: false,
    weekendColor: '#ffcccc',
    isPrinting: false,
    chartPixelRatio: null,
    lastRenderWidth: 0
};

// ============================================
// PANEL LATERAL RESPONSIVE
// ============================================

// Por debajo de este ancho el panel de configuración se comporta como un
// cajón deslizante superpuesto (ver la media query equivalente en style.css).
const MOBILE_BREAKPOINT = 900;

function isMobileLayout() {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function isSidebarOpen() {
    const sidebar = document.getElementById('sidebar');
    return !!sidebar && sidebar.classList.contains('is-open');
}

function openSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const toggle = document.getElementById('menuToggle');
    if (!sidebar) return;

    sidebar.classList.add('is-open');
    if (backdrop) backdrop.classList.add('is-visible');
    if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Cerrar configuración');
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const toggle = document.getElementById('menuToggle');
    if (!sidebar) return;

    sidebar.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-visible');
    if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Abrir configuración');
    }
}

function toggleSidebar() {
    if (isSidebarOpen()) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

// Tras una acción que modifica el calendario, cerrar el cajón en móvil para
// que el resultado quede a la vista sin pasos adicionales.
function closeSidebarOnMobile() {
    if (isMobileLayout()) {
        closeSidebar();
    }
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', function() {
    loadTheme(); // Cargar tema antes de inicializar
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    // Establecer mes actual como predeterminado
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('startMonth').value = currentMonth;
    state.startMonth = currentMonth;
    
    // Cargar datos guardados
    loadFromLocalStorage();
    
    // La etiqueta reservada existe siempre, haya datos guardados o no
    ensureHolidayTag();
    
    // Renderizar interfaz
    renderTagsList();
    renderTagsSelect();
    renderPeriodsList();
    renderHolidayLoader();
    refreshTagColorSuggestion();
    renderCalendar();
}

function setupEventListeners() {
    // Actualizar período
    document.getElementById('updatePeriod').addEventListener('click', updatePeriod);
    
    // Agregar etiqueta
    document.getElementById('addTag').addEventListener('click', addTag);
    
    // Marcar días
    document.getElementById('markRange').addEventListener('click', markRange);
    document.getElementById('clearSelection').addEventListener('click', clearSelection);
    
    // Sincronizar fecha de fin con fecha de inicio
    document.getElementById('startDate').addEventListener('change', function() {
        const endInput = document.getElementById('endDate');
        if (!endInput.value || endInput.value < this.value) {
            endInput.value = this.value;
        }
        endInput.min = this.value;
    });
    
    // Validar que fecha fin no sea anterior a fecha inicio
    document.getElementById('endDate').addEventListener('change', function() {
        const startInput = document.getElementById('startDate');
        if (startInput.value && this.value < startInput.value) {
            this.value = startInput.value;
        }
    });
    
    // Exportar/Importar
    document.getElementById('exportData').addEventListener('click', exportData);
    document.getElementById('importData').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importData);
    
    // Opciones de visualización (fines de semana)
    document.getElementById('highlightWeekends').addEventListener('change', function() {
        state.highlightWeekends = this.checked;
        saveToLocalStorage();
        renderCalendar();
    });
    document.getElementById('weekendColor').addEventListener('change', function() {
        state.weekendColor = this.value;
        if (state.highlightWeekends) {
            saveToLocalStorage();
            renderCalendar();
        }
    });
    
    // Validación del campo "meses a mostrar"
    const monthsCountInput = document.getElementById('monthsCount');
    monthsCountInput.addEventListener('input', function() {
        // Eliminar caracteres no numéricos
        this.value = this.value.replace(/[^0-9]/g, '');
        
        let value = parseInt(this.value);
        if (isNaN(value) || value < 1) {
            this.value = 1;
        } else if (value > 36) {
            this.value = 36;
        }
    });
    
    monthsCountInput.addEventListener('blur', function() {
        // Asegurar valor válido al perder foco
        let value = parseInt(this.value);
        if (isNaN(value) || value < 1) {
            this.value = 1;
        } else if (value > 36) {
            this.value = 36;
        }
    });
    
    // Validación del campo "fecha inicio" del período
    const startMonthInput = document.getElementById('startMonth');
    startMonthInput.addEventListener('change', function() {
        if (this.value) {
            // Validar formato YYYY-MM
            const regex = /^\d{4}-(0[1-9]|1[0-2])$/;
            if (!regex.test(this.value)) {
                alert('Formato de fecha no válido. Use el selector de mes.');
                const today = new Date();
                this.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
                return;
            }
            const [year] = this.value.split('-').map(Number);
            if (year < 1900 || year > 2100) {
                alert('El año debe estar entre 1900 y 2100');
                const today = new Date();
                this.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            }
        }
    });
    
    // Validación adicional al escribir en el campo de mes (prevenir entrada manual inválida)
    startMonthInput.addEventListener('input', function() {
        // Si el valor no está vacío y no coincide con el patrón parcial, limpiar
        if (this.value && !/^\d{0,4}(-\d{0,2})?$/.test(this.value)) {
            const today = new Date();
            this.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        }
    });
    
    // Selector de tema
    document.getElementById('themeSelector').addEventListener('change', function() {
        applyTheme(this.value);
    });
    
    // La casilla de días laborables no aplica a la etiqueta de festivos
    document.getElementById('selectedTag').addEventListener('change', syncBusinessDaysControl);
    document.getElementById('businessDaysOnly').addEventListener('change', function() {
        if (!this.disabled) businessDaysPreference = this.checked;
    });
    
    // Festivos oficiales
    document.getElementById('loadHolidays').addEventListener('click', loadOfficialHolidays);
    
    // Panel lateral en móvil
    document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
    document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
    document.getElementById('sidebarBackdrop').addEventListener('click', closeSidebar);

    // Escape cierra primero el modal abierto y, si no hay, el panel lateral
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        if (document.querySelector('.modal-overlay')) {
            closeModal();
        } else if (isSidebarOpen()) {
            closeSidebar();
        }
    });

    // Tocar fuera del modal lo cierra
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });

    // Recalcular el calendario cuando cambia el espacio disponible
    // (rotación del dispositivo, barra de direcciones del navegador, etc.)
    if (typeof ResizeObserver !== 'undefined') {
        const calendarArea = document.querySelector('.calendar-container');
        if (calendarArea) {
            new ResizeObserver(scheduleViewportUpdate).observe(calendarArea);
        }
    }

    // Generar leyenda antes de imprimir y forzar tema claro
    window.addEventListener('beforeprint', prepareForPrint);
    window.addEventListener('afterprint', restoreAfterPrint);
}

// Preparar para impresión: forzar tema claro y re-renderizar
function prepareForPrint() {
    state.isPrinting = true;

    // beforeprint se dispara antes de que el navegador recomponga la página al
    // ancho del papel, así que el contenedor mediría todavía el de la ventana y
    // el calendario saldría cortado. Se fija el ancho de impresión y se deja
    // puesto: el lienzo queda con ese tamaño y no hace falta escalarlo.
    const container = document.getElementById('calendar');
    if (container) {
        container.style.width = `${PRINT_WIDTH_PX}px`;
    }

    renderCalendar();
    generatePrintLegend();
}

// Restaurar después de imprimir
function restoreAfterPrint() {
    state.isPrinting = false;

    const container = document.getElementById('calendar');
    if (container) {
        container.style.width = '';
    }

    // Pequeño delay para permitir que el layout se restaure completamente
    setTimeout(() => {
        renderCalendar();
    }, 100);
}

// Generar leyenda para impresión
function generatePrintLegend() {
    const legendContent = document.getElementById('legendContent');
    legendContent.innerHTML = '';
    
    // Añadir etiquetas usadas
    state.tags.forEach(tag => {
        const dayCount = countDaysForTag(tag.id);
        const dayText = dayCount === 1 ? '1 día' : `${dayCount} días`;
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <span class="legend-color" style="background-color: ${tag.color};"></span>
            <span class="legend-name">${tag.name} (${dayText})</span>
        `;
        legendContent.appendChild(item);
    });
    
    // Añadir fines de semana si está activado
    if (state.highlightWeekends) {
        const weekendItem = document.createElement('div');
        weekendItem.className = 'legend-item';
        weekendItem.innerHTML = `
            <span class="legend-color" style="background-color: ${state.weekendColor};"></span>
            <span class="legend-name">Fin de semana</span>
        `;
        legendContent.appendChild(weekendItem);
    }
    
    // Actualizar pie de página con la URL configurada
    const footerLink = document.getElementById('footerLink');
    if (footerLink) {
        footerLink.href = CONFIG.footerUrl;
        footerLink.textContent = CONFIG.footerUrl;
    }
}

// Contar días marcados para una etiqueta específica
function countDaysForTag(tagId) {
    let count = 0;
    Object.values(state.markedDays).forEach(tags => {
        const tagArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
        if (tagArray.some(t => t.tagId === tagId)) {
            count++;
        }
    });
    return count;
}

// Gestión de etiquetas
function addTag() {
    const nameInput = document.getElementById('tagName');
    const colorInput = document.getElementById('tagColor');
    
    const name = nameInput.value.trim();
    const color = colorInput.value;
    
    if (!name) {
        alert('Por favor, ingresa un nombre para la etiqueta');
        return;
    }
    
    if (normalizeTagName(name) === normalizeTagName(HOLIDAY_TAG_NAME)) {
        alert(`"${HOLIDAY_TAG_NAME}" es una etiqueta reservada que ya existe. Marca los días festivos seleccionándola en "Marcar días".`);
        return;
    }
    
    if (state.tags.some(t => normalizeTagName(t.name) === normalizeTagName(name))) {
        alert('Ya existe una etiqueta con ese nombre');
        return;
    }
    
    const tag = {
        id: `tag_${Date.now()}`,
        name: name,
        color: color
    };
    
    state.tags.push(tag);
    
    // Limpiar inputs. El color no vuelve al de siempre: se propone uno nuevo
    // para poder encadenar etiquetas sin pararse a elegirlo cada vez.
    nameInput.value = '';
    refreshTagColorSuggestion();
    
    // Actualizar interfaz
    renderTagsList();
    renderTagsSelect();
    saveToLocalStorage();
}

function deleteTag(tagId) {
    if (isHolidayTag(tagId)) {
        alert(`La etiqueta "${HOLIDAY_TAG_NAME}" no se puede eliminar. Puedes borrar sus períodos uno a uno.`);
        return;
    }
    
    if (!confirm('¿Estás seguro de eliminar esta etiqueta? Los días y períodos marcados con esta etiqueta se eliminarán.')) {
        return;
    }
    
    // Eliminar etiqueta
    state.tags = state.tags.filter(tag => tag.id !== tagId);

    // Eliminar marcas asociadas
    removeMarksForTag(tagId);
    
    // Eliminar períodos asociados
    state.periods = state.periods.filter(p => p.tagId !== tagId);

    // Actualizar interfaz
    renderTagsList();
    renderTagsSelect();
    renderPeriodsList();
    renderCalendar();
    saveToLocalStorage();
}

// Vuelve a materializar las marcas de un período a partir de su rango y modo
function applyPeriodMarks(period) {
    const dates = getPeriodDates(period.startDate, period.endDate, period.countMode);

    dates.forEach(dateStr => {
        const current = Array.isArray(state.markedDays[dateStr]) ? state.markedDays[dateStr] : (state.markedDays[dateStr] ? [state.markedDays[dateStr]] : []);
        if (!current.some(entry => entry.periodId === period.id)) {
            current.push({ tagId: period.tagId, color: period.tagColor, name: period.tagName, periodId: period.id });
        }
        state.markedDays[dateStr] = current;
    });

    return dates.length;
}

// Los festivos solo alteran los períodos laborables. Al cambiar la lista hay que
// recalcularlos para que lo marcado y lo contado sigan coincidiendo.
function rebuildBusinessPeriodMarks() {
    state.periods
        .filter(period => period.countMode === COUNT_MODE_BUSINESS)
        .forEach(period => {
            removePeriodMarks(period.id);
            applyPeriodMarks(period);
        });
}

// ============================================
// CARGA DE FESTIVOS OFICIALES
// ============================================

function getHolidayDataset() {
    return typeof FESTIVOS_ES !== 'undefined' ? FESTIVOS_ES : null;
}

// Rellena los selectores de comunidad y año a partir del fichero de datos
function renderHolidayLoader() {
    const datos = getHolidayDataset();
    const regionSelect = document.getElementById('holidayRegion');
    const yearSelect = document.getElementById('holidayYear');
    const button = document.getElementById('loadHolidays');

    if (!datos) {
        // Sin el fichero de datos la sección no puede hacer nada
        regionSelect.innerHTML = '<option value="">-- No disponible --</option>';
        regionSelect.disabled = true;
        yearSelect.disabled = true;
        button.disabled = true;
        return;
    }

    const guardada = localStorage.getItem('colorcal-region') || '';
    regionSelect.innerHTML = '<option value="">-- Seleccionar --</option>' +
        Object.entries(datos.comunidades)
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([cod, nombre]) => `<option value="${cod}"${cod === guardada ? ' selected' : ''}>${escapeHtml(nombre)}</option>`)
            .join('');

    // Por defecto, el año en el que empieza el calendario mostrado
    const anios = Object.keys(datos.anios).sort();
    const actual = String(state.startMonth || '').slice(0, 4);
    yearSelect.innerHTML = anios
        .map(a => `<option value="${a}"${a === actual ? ' selected' : ''}>${a}${Number(a) > datos.oficialHasta ? ' (provisional)' : ''}</option>`)
        .join('');
}

function loadOfficialHolidays() {
    const datos = getHolidayDataset();
    if (!datos) return;

    const region = document.getElementById('holidayRegion').value;
    const anio = document.getElementById('holidayYear').value;

    if (!region) {
        alert('Por favor, selecciona una comunidad autónoma');
        return;
    }

    const festivos = (datos.anios[anio] || {})[region] || [];
    if (festivos.length === 0) {
        alert('No hay datos de festivos para esa comunidad y ese año');
        return;
    }

    localStorage.setItem('colorcal-region', region);

    const tag = ensureHolidayTag();
    let añadidos = 0;
    let existentes = 0;

    festivos.forEach(([fecha, nombre]) => {
        if (isHolidayDate(fecha)) {
            existentes++;
            return;
        }
        const period = {
            id: `period_${Date.now()}_${añadidos}`,
            tagId: tag.id,
            startDate: fecha,
            endDate: fecha,
            tagName: tag.name,
            tagColor: tag.color,
            countMode: COUNT_MODE_NATURAL,
            label: nombre
        };
        state.periods.push(period);
        applyPeriodMarks(period);
        añadidos++;
    });

    // Los festivos nuevos cambian qué días son laborables para el resto
    rebuildBusinessPeriodMarks();
    refreshMarkedDaysViews();

    const provisional = Number(anio) > datos.oficialHasta
        ? `\n\nEl BOE solo tiene publicada la relación hasta ${datos.oficialHasta}, así que ${anio} es provisional: conviene revisarlo.`
        : '';
    const omitidos = existentes > 0 ? `\nSe omitieron ${existentes} que ya estaban marcados.` : '';
    alert(`Se añadieron ${añadidos} festivos de ${datos.comunidades[region]} para ${anio}.${omitidos}` +
          `\n\nRecuerda añadir a mano los dos festivos locales de tu municipio.${provisional}`);

    closeSidebarOnMobile();
}

// Un cambio en los días marcados afecta a tres sitios: el calendario, el
// contador de días de cada etiqueta y la lista de períodos. Centralizarlo
// evita que un punto de mutación se deje alguno sin refrescar.
function refreshMarkedDaysViews() {
    renderTagsList();
    renderPeriodsList();
    renderCalendar();
    saveToLocalStorage();
}

// La etiqueta reservada va siempre la primera; el resto en orden alfabético
// español, para que ñ y acentos caigan donde se espera. Se ordena al pintar, no
// en state.tags: es presentación, y así el orden se recalcula solo al renombrar.
function getSortedTags() {
    return [...state.tags].sort((a, b) => {
        if (isHolidayTag(a.id) !== isHolidayTag(b.id)) {
            return isHolidayTag(a.id) ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
}

function renderTagsList() {
    const container = document.getElementById('tagsList');
    
    if (state.tags.length === 0) {
        container.innerHTML = '<p class="empty-message">No hay etiquetas</p>';
        return;
    }
    
    container.innerHTML = getSortedTags().map(tag => {
        const dayCount = countDaysForTag(tag.id);
        const dayText = dayCount === 1 ? '1 día' : `${dayCount} días`;
        return `
        <div class="tag-item">
            <div class="tag-info">
                <div class="tag-color-box" style="background: ${tag.color};"></div>
                <span class="tag-name">${escapeHtml(tag.name)}</span>
                <span class="tag-day-count">(${dayText})</span>
            </div>
            <div class="tag-actions">
                <button class="tag-edit" onclick="editTag('${tag.id}')" title="${isHolidayTag(tag.id) ? 'Editar color' : 'Editar etiqueta'}" aria-label="Editar">✏️</button>
                ${isHolidayTag(tag.id) ? '' : `<button class="tag-delete" onclick="deleteTag('${tag.id}')" aria-label="Eliminar">🗑️</button>`}
            </div>
        </div>
    `;
    }).join('');
}

// Los períodos de la etiqueta reservada son siempre naturales, porque en modo
// laborable se excluirían a sí mismos. Antes la casilla se dejaba marcar y el
// valor se ignoraba en silencio; ahora se deshabilita y se explica por qué.
const TEXTO_LABORABLES = 'Excluye sábados, domingos y festivos del período';

// Se recuerda lo que el usuario tenía marcado para restaurarlo al volver a una
// etiqueta normal, en vez de desmarcárselo sin avisar.
let businessDaysPreference = false;

function syncBusinessDaysControl() {
    const checkbox = document.getElementById('businessDaysOnly');
    const label = document.getElementById('businessDaysLabel');
    const hint = document.getElementById('businessDaysHint');
    const select = document.getElementById('selectedTag');
    if (!checkbox || !select) return;

    const esFestivo = isHolidayTag(select.value);

    checkbox.disabled = esFestivo;
    checkbox.checked = esFestivo ? false : businessDaysPreference;

    if (label) label.classList.toggle('is-disabled', esFestivo);
    if (hint) {
        hint.textContent = esFestivo
            ? `Los períodos de "${HOLIDAY_TAG_NAME}" cuentan siempre en días naturales`
            : TEXTO_LABORABLES;
    }
}

function renderTagsSelect() {
    const select = document.getElementById('selectedTag');
    
    if (state.tags.length === 0) {
        select.innerHTML = '<option value="">-- Sin etiquetas --</option>';
        return;
    }
    
    select.innerHTML = '<option value="">-- Seleccionar --</option>' + 
        getSortedTags().map(tag => `
            <option value="${tag.id}">${escapeHtml(tag.name)}</option>
        `).join('');

    syncBusinessDaysControl();
}

// Marcar días
function markRange() {
    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');
    const tagSelect = document.getElementById('selectedTag');
    
    const tagId = tagSelect.value;
    
    if (!startInput.value || !endInput.value) {
        alert('Por favor, selecciona ambas fechas');
        return;
    }
    
    if (!tagId) {
        alert('Por favor, selecciona una etiqueta');
        return;
    }
    
    if (parseLocalDate(startInput.value) > parseLocalDate(endInput.value)) {
        alert('La fecha de inicio debe ser anterior a la fecha de fin');
        return;
    }
    
    const countMode = resolveCountMode(tagId, document.getElementById('businessDaysOnly').checked
        ? COUNT_MODE_BUSINESS
        : COUNT_MODE_NATURAL);
    const dates = getPeriodDates(startInput.value, endInput.value, countMode);

    if (dates.length === 0) {
        alert('El rango seleccionado no contiene ningún día laborable');
        return;
    }
    
    const tag = state.tags.find(t => t.id === tagId);
    
    // Crear el período
    const period = {
        id: `period_${Date.now()}`,
        tagId: tag.id,
        startDate: startInput.value,
        endDate: endInput.value,
        tagName: tag.name,
        tagColor: tag.color,
        countMode: countMode,
        label: document.getElementById('periodLabel').value.trim()
    };
    state.periods.push(period);
    
    // Marcar los días que abarca el período
    dates.forEach(dateStr => {
        const current = Array.isArray(state.markedDays[dateStr]) ? state.markedDays[dateStr] : (state.markedDays[dateStr] ? [state.markedDays[dateStr]] : []);
        const exists = current.some(entry => entry.tagId === tag.id);
        if (!exists) {
            current.push({ tagId: tag.id, color: tag.color, name: tag.name, periodId: period.id });
        }
        state.markedDays[dateStr] = current;
    });
    
    // Un período de festivos cambia qué días son laborables para los demás
    if (isHolidayTag(tag.id)) {
        rebuildBusinessPeriodMarks();
    }
    
    refreshMarkedDaysViews();
    
    // Limpiar inputs
    startInput.value = '';
    endInput.value = '';
    document.getElementById('periodLabel').value = '';

    closeSidebarOnMobile();
}

function clearSelection() {
    if (!confirm('¿Estás seguro de limpiar todos los días marcados? También se eliminarán los períodos de festivos.')) {
        return;
    }
    
    state.markedDays = {};
    state.periods = [];
    refreshMarkedDaysViews();
}

// Validar formato de mes (YYYY-MM)
function isValidMonthFormat(value) {
    if (!value || typeof value !== 'string') return false;
    const regex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!regex.test(value)) return false;
    const [year] = value.split('-').map(Number);
    return year >= 1900 && year <= 2100;
}

// Actualizar período
function updatePeriod() {
    const startMonthInput = document.getElementById('startMonth');
    const monthsCountInput = document.getElementById('monthsCount');
    
    const monthValue = startMonthInput.value;
    
    if (!monthValue || !isValidMonthFormat(monthValue)) {
        alert('Por favor, selecciona un mes de inicio válido (formato: AAAA-MM)');
        // Restablecer al mes actual si el valor no es válido
        const today = new Date();
        startMonthInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        return;
    }
    
    state.startMonth = monthValue;
    state.monthsCount = parseInt(monthsCountInput.value);
    
    if (isNaN(state.monthsCount) || state.monthsCount < 1 || state.monthsCount > 36) {
        alert('El número de meses debe estar entre 1 y 36');
        monthsCountInput.value = 12;
        state.monthsCount = 12;
        return;
    }
    
    renderCalendar();
    renderHolidayLoader();
    saveToLocalStorage();
    closeSidebarOnMobile();
}

// Ancho con el que se dibuja el calendario al imprimir. Un A4 vertical con los
// márgenes por defecto de Firefox (12,7 mm) deja unos 698 px útiles, así que a
// 690 px el calendario entra sin que el navegador tenga que escalarlo y sin que
// haga falta redimensionar el lienzo por CSS, que es frágil entre navegadores.
const PRINT_WIDTH_PX = 690;

// Límites prácticos del elemento <canvas> en navegadores móviles. Un calendario de
// muchos meses en una sola columna puede superarlos y quedarse en blanco, así que
// ajustamos la densidad de píxeles al tamaño real del lienzo.
const MAX_CANVAS_SIDE_PX = 16000;
const MAX_CANVAS_AREA_PX = 16000000;

function getSafeDevicePixelRatio(widthPx, heightPx) {
    const dpr = window.devicePixelRatio || 1;
    if (!widthPx || !heightPx) return dpr;
    const sideLimit = MAX_CANVAS_SIDE_PX / Math.max(widthPx, heightPx);
    const areaLimit = Math.sqrt(MAX_CANVAS_AREA_PX / (widthPx * heightPx));
    return Math.max(1, Math.min(dpr, sideLimit, areaLimit));
}

// La densidad de píxeles solo puede fijarse al crear la instancia, así que
// recreamos el chart cuando el tamaño del lienzo obliga a cambiarla.
function ensureChart(container, widthPx, heightPx) {
    // Al imprimir se fija una densidad estable: si cambiara respecto a la de
    // pantalla habría que destruir y recrear el gráfico en pleno beforeprint,
    // que es justo cuando menos margen hay para repintarlo.
    const dpr = state.isPrinting
        ? Math.min(2, getSafeDevicePixelRatio(widthPx, heightPx))
        : getSafeDevicePixelRatio(widthPx, heightPx);

    if (state.chart && Math.abs((state.chartPixelRatio || 0) - dpr) > 0.05) {
        state.chart.dispose();
        state.chart = null;
    }

    if (!state.chart) {
        state.chart = echarts.init(container, null, { devicePixelRatio: dpr });
        state.chartPixelRatio = dpr;
    }

    return state.chart;
}

// Parámetros de maquetación según el ancho disponible: en móvil se reduce el
// número de columnas y se agrandan celdas y tipografías para que el calendario
// siga siendo legible.
function getCalendarLayout(containerWidth, monthsCount) {
    // Al imprimir manda el papel, no la pantalla: tres columnas (la disposición
    // clásica de un calendario anual), cuatro si es más de un año, y métricas
    // compactas para que quepa.
    if (state.isPrinting) {
        const printColumns = Math.max(1, Math.min(monthsCount > 12 ? 4 : 3, monthsCount));
        const printWidthPercent = 100 / printColumns;
        const printCalendarWidth = containerWidth * (printWidthPercent - 3) / 100;
        return {
            columns: printColumns,
            widthPercent: printWidthPercent,
            cellWidthPx: Math.max(18, printCalendarWidth / 7),
            cellHeightPx: 22,
            topOffsetPx: 92,
            gapY: 54,
            calendarPadPx: 28,
            monthLabelGapPx: 44,
            titleFontSize: 20,
            monthFontSize: 12,
            dayFontSize: 9
        };
    }

    let columns;
    let titleFontSize;
    let monthFontSize;
    let topOffsetPx;
    let gapY;
    let calendarPadPx;
    let monthLabelGapPx;

    if (containerWidth < 520) {
        columns = 1;
        titleFontSize = 18;
        monthFontSize = 15;
        topOffsetPx = 100;
        gapY = 62;
        calendarPadPx = 34;
        monthLabelGapPx = 56;
    } else if (containerWidth < 860) {
        columns = 2;
        titleFontSize = 20;
        monthFontSize = 14;
        topOffsetPx = 102;
        gapY = 76;
        calendarPadPx = 32;
        monthLabelGapPx = 48;
    } else {
        columns = 3;
        titleFontSize = 24;
        monthFontSize = 14;
        topOffsetPx = 120;
        gapY = 90;
        calendarPadPx = 30;
        monthLabelGapPx = 56;
    }

    columns = Math.max(1, Math.min(columns, monthsCount));

    const widthPercent = 100 / columns;
    const calendarWidthPx = containerWidth * (widthPercent - 3) / 100;
    // Ancho real de celda: ECharts reparte el ancho asignado entre los siete
    // días, así que hay que usar esa misma división para que las marcas encajen.
    const cellWidthPx = Math.max(18, calendarWidthPx / 7);
    // A una sola columna las celdas son mucho más anchas: crecen también en alto
    // para no quedar aplastadas y para facilitar la lectura en pantalla pequeña.
    const cellHeightPx = Math.round(
        Math.max(26, Math.min(46, cellWidthPx * (columns === 1 ? 0.72 : 0.52)))
    );
    const dayFontSize = Math.max(10, Math.min(15, Math.round(cellHeightPx * 0.42)));

    return {
        columns,
        widthPercent,
        cellWidthPx,
        cellHeightPx,
        topOffsetPx,
        gapY,
        calendarPadPx,
        monthLabelGapPx,
        titleFontSize,
        monthFontSize,
        dayFontSize
    };
}

// Renderizar calendario con ECharts
function renderCalendar() {
    const container = document.getElementById('calendar');

    // Calcular fechas
    const [year, month] = state.startMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    
    // Generar configuración de calendarios
    const calendars = [];
    const series = [];
    const graphics = [];
    const containerWidth = container.clientWidth || container.offsetWidth || 800;
    const layout = getCalendarLayout(containerWidth, Math.max(1, state.monthsCount));
    const columns = layout.columns;
    const widthPercent = layout.widthPercent;
    const topOffsetPx = layout.topOffsetPx; // espacio para título general
    const gapY = layout.gapY; // espacio entre filas de meses (incluye título)
    const cellHeightPx = layout.cellHeightPx;
    const calendarPadPx = layout.calendarPadPx; // espacio extra para labels de días
    const cellWidthPx = layout.cellWidthPx;
    // El hueco entre la marca y el borde de la celda tiene que ser proporcional:
    // 6 px fijos son el 13% de una celda de pantalla pero el 28% de una de
    // impresión, y ahí la marca se queda pequeña y descuadrada dentro del hueco.
    const markGapPx = Math.max(2, Math.min(6, cellWidthPx * 0.13));
    // La cabecera de días también tiene que encoger con la celda: a 12 px fijos,
    // "Sáb" y "Dom" se solapan en las celdas estrechas de la impresión.
    const dayLabelFontSize = Math.max(8, Math.min(12, cellWidthPx * 0.42));

    state.lastRenderWidth = containerWidth;
    
    let currentTopPx = topOffsetPx;
    let rowMaxHeight = 0;
    
    for (let i = 0; i < state.monthsCount; i++) {
        const currentYear = startDate.getFullYear();
        const currentMonth = startDate.getMonth() + i;
        const adjustedYear = currentYear + Math.floor(currentMonth / 12);
        const adjustedMonth = (currentMonth % 12) + 1;
        const row = Math.floor(i / columns);
        const col = i % columns;
        const weeks = getWeeksInMonth(adjustedYear, adjustedMonth);
        // Altura calculada exactamente según semanas y tamaño de celda fijo
        const calHeightPx = weeks * cellHeightPx + calendarPadPx;

        // Si iniciamos una nueva fila, ajustamos top usando la altura máxima de la fila anterior
        if (col === 0 && i !== 0) {
            currentTopPx += rowMaxHeight + gapY;
            rowMaxHeight = 0;
        }

        const topPx = currentTopPx;
        const leftPercent = col * widthPercent + 2;
        rowMaxHeight = Math.max(rowMaxHeight, calHeightPx);
        
        const monthText = `${adjustedYear}-${String(adjustedMonth).padStart(2, '0')}`;
        
        // Obtener colores del tema actual
        const themeColors = getThemeColors();

        calendars.push({
            top: topPx,
            left: `${leftPercent}%`,
            width: `${widthPercent - 3}%`,
            cellSize: [cellWidthPx, cellHeightPx], // tamaño fijo de celda
            orient: 'vertical',
            range: `${adjustedYear}-${String(adjustedMonth).padStart(2, '0')}`,
            splitLine: {
                show: true,
                lineStyle: {
                    color: themeColors.borderColor,
                    width: 1,
                    type: 'solid'
                }
            },
            yearLabel: { show: false },
            dayLabel: {
                nameMap: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
                firstDay: 1,
                position: 'start',
                fontSize: dayLabelFontSize,
                color: themeColors.textSecondary
            },
            monthLabel: {
                nameMap: 'es',
                formatter: '{yyyy}-{MM}',
                show: false
            },
            itemStyle: {
                color: themeColors.bgSecondary,
                borderWidth: 1,
                borderColor: themeColors.borderColor
            }
        });

        graphics.push({
            type: 'text',
            left: `${leftPercent}%`,
            right: `${100 - leftPercent - (widthPercent - 3)}%`,
            top: Math.max(0, topPx - layout.monthLabelGapPx),
            style: {
                text: monthText,
                fill: themeColors.textPrimary,
                fontWeight: 'bold',
                fontSize: layout.monthFontSize,
                textAlign: 'center'
            }
        });

        // Preparar datos para este mes
        const monthRange = `${adjustedYear}-${String(adjustedMonth).padStart(2, '0')}`;
        const monthData = [];
        
        Object.entries(state.markedDays).forEach(([date, tags]) => {
            if (!date.startsWith(monthRange)) return;

            const tagArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
            if (tagArray.length === 0) return;

            const entries = tagArray.map(t => {
                // La descripción del período, si la tiene, matiza el nombre de la
                // etiqueta: "Festivos — Navidad", "Vacaciones — agosto"
                const period = state.periods.find(p => p.id === t.periodId);
                const label = period && period.label ? period.label : '';
                const name = t.name || 'Etiqueta';
                return {
                    color: t.color || '#3498db',
                    name: label ? `${name} — ${label}` : name
                };
            });

            monthData.push({ date: date, tags: entries });
        });

        // Crear series scatter para cada etiqueta
        if (monthData.length > 0) {
            monthData.forEach(item => {
                const numTags = item.tags.length;
                const stripeH = (cellHeightPx - 2) / numTags;
                
                item.tags.forEach((tag, tagIdx) => {
                    // Calcular offset para apilar franjas
                    const offsetY = (tagIdx - (numTags - 1) / 2) * stripeH;
                    
                    series.push({
                        type: 'scatter',
                        coordinateSystem: 'calendar',
                        calendarIndex: i,
                        data: [[item.date, 1]],
                        z: 10 + tagIdx,
                        symbol: 'rect',
                        symbolSize: [cellWidthPx - markGapPx, stripeH],
                        symbolOffset: [0, offsetY],
                        itemStyle: {
                            color: tag.color,
                            borderColor: '#fff',
                            borderWidth: 0.5
                        },
                        tooltip: {
                            formatter: function() {
                                const lines = item.tags.map(t => 
                                    `<span style="display:inline-block;width:12px;height:12px;background:${t.color};margin-right:8px;border-radius:2px;vertical-align:middle;"></span>${escapeHtml(t.name)}`
                                );
                                return `<strong>${item.date}</strong><br/>` + lines.join('<br/>');
                            }
                        }
                    });
                });
            });
        }

        // Serie de etiquetas de día (número visible en cada celda)
        const daysInMonth = getDaysOfMonth(adjustedYear, adjustedMonth).map(d => {
            const bgColor = getDayBackgroundColor(d, state.markedDays);
            // Prioridad de fondo: período marcado > festivo > fin de semana
            const isWeekend = isWeekendDate(parseLocalDate(d));
            const effectiveBgColor = bgColor
                || (state.highlightWeekends && isWeekend ? state.weekendColor : null);
            const textColor = effectiveBgColor ? getContrastColor(effectiveBgColor) : themeColors.textPrimary;
            return {
                value: [d, 1],
                label: {
                    color: textColor
                }
            };
        });
        
        // Serie para colorear fines de semana (si está activado)
        if (state.highlightWeekends) {
            const weekendDays = getDaysOfMonth(adjustedYear, adjustedMonth).filter(d => {
                return isWeekendDate(parseLocalDate(d)) && !state.markedDays[d];
            });
            
            if (weekendDays.length > 0) {
                series.push({
                    type: 'scatter',
                    coordinateSystem: 'calendar',
                    calendarIndex: i,
                    data: weekendDays.map(d => [d, 1]),
                    z: 5,
                    symbol: 'rect',
                    symbolSize: [cellWidthPx - markGapPx, cellHeightPx - 2],
                    itemStyle: {
                        color: state.weekendColor
                    },
                    tooltip: {
                        show: false
                    }
                });
            }
        }
        series.push({
            type: 'scatter',
            coordinateSystem: 'calendar',
            calendarIndex: i,
            data: daysInMonth,
            symbolSize: 0,
            z: 50,
            label: {
                show: true,
                formatter: params => (params.value && params.value[0] ? params.value[0].split('-')[2].replace(/^0/, '') : ''),
                color: themeColors.textPrimary,
                fontSize: layout.dayFontSize,
                fontWeight: 700,
                position: 'inside',
                offset: [0, 0]
            },
            itemStyle: {
                color: 'transparent'
            },
            tooltip: {
                show: false
            }
        });
    }
    // Altura total para el contenedor del chart (para habilitar scroll)
    // Al imprimir, el margen inferior que da aire al hacer scroll es espacio
    // muerto que empuja la leyenda y el pie a otra página.
    const bottomPadPx = state.isPrinting ? 16 : gapY + 40;
    const totalHeightPx = currentTopPx + rowMaxHeight + bottomPadPx;
    container.style.height = `${totalHeightPx}px`;
    container.style.minHeight = `${totalHeightPx}px`;

    ensureChart(container, containerWidth, totalHeightPx);

    const option = {
        title: {
            text: 'Calendario',
            left: 'center',
            top: 10,
            textStyle: {
                fontSize: layout.titleFontSize,
                fontWeight: 'bold',
                color: getThemeColors().textPrimary
            }
        },
        tooltip: {
            trigger: 'item',
            confine: true,
            enterable: false,
            textStyle: {
                fontSize: layout.columns === 1 ? 14 : 12
            }
        },
        calendar: calendars,
        graphic: graphics,
        series: series
    };
    
    state.chart.setOption(option, true);
    state.chart.resize();

    // ECharts pinta en el siguiente fotograma. Al imprimir eso no vale: el
    // navegador puede capturar la página antes, y el lienzo saldría con las
    // dimensiones nuevas y el dibujo anterior, o recién creado y aún vacío si
    // ensureChart tuvo que recrearlo. flush() fuerza el pintado ahora.
    const zr = state.chart.getZr && state.chart.getZr();
    if (zr && typeof zr.flush === 'function') {
        zr.flush();
    }
}

// Devuelve todas las fechas (YYYY-MM-DD) de un mes
function getDaysOfMonth(year, month) {
    const days = [];
    const total = new Date(year, month, 0).getDate();
    for (let d = 1; d <= total; d++) {
        days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return days;
}

// Número de semanas (filas) de un mes considerando inicio en lunes
function getWeeksInMonth(year, month) {
    const totalDays = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1);
    // getDay(): 0 domingo ... 6 sábado. Convertimos a lunes=0.
    const offset = (firstDay.getDay() + 6) % 7;
    return Math.ceil((offset + totalDays) / 7);
}

// Eliminar marcas de un tag sin borrar la etiqueta
function clearTagMarks(tagId) {
    removeMarksForTag(tagId);
    renderCalendar();
    saveToLocalStorage();
}

// Renderizar lista de períodos
function renderPeriodsList() {
    const container = document.getElementById('periodsList');
    
    if (state.periods.length === 0) {
        container.innerHTML = '<p class="empty-message">No hay períodos marcados</p>';
        return;
    }
    
    // Se ordena al pintar, no en state.periods: es una cuestión de presentación y
    // así el orden se mantiene correcto al editar las fechas de un período.
    // Las fechas son YYYY-MM-DD, por lo que el orden alfabético es el cronológico.
    const ordenados = [...state.periods].sort((a, b) =>
        a.startDate.localeCompare(b.startDate)
        || a.endDate.localeCompare(b.endDate)
        || a.tagName.localeCompare(b.tagName, 'es')
    );

    container.innerHTML = ordenados.map(period => `
        <div class="period-item" data-id="${period.id}">
            <div class="period-info">
                <div class="period-color-box" style="background: ${period.tagColor};"></div>
                <div class="period-details">
                    <span class="period-tag-name">${escapeHtml(period.tagName)}${period.label ? ` <span class="period-label">${escapeHtml(period.label)}</span>` : ''}</span>
                    <span class="period-dates">${formatDisplayDate(period.startDate)} - ${formatDisplayDate(period.endDate)} · ${formatPeriodCount(period)}</span>
                </div>
            </div>
            <div class="period-actions">
                <button class="period-edit" onclick="editPeriod('${period.id}')" title="Editar período" aria-label="Editar">✏️</button>
                <button class="period-delete" onclick="deletePeriod('${period.id}')" title="Eliminar período" aria-label="Eliminar">🗑️</button>
            </div>
        </div>
    `).join('');
}

// Formatear fecha para mostrar (DD/MM/YYYY)
function formatDisplayDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

// Editar período
function editPeriod(periodId) {
    const period = state.periods.find(p => p.id === periodId);
    if (!period) return;
    
    // Crear modal de edición
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'editPeriodModal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Editar Período</h3>
            <div class="modal-form">
                <label>Etiqueta:</label>
                <select id="editPeriodTag">
                    ${state.tags.map(tag => `
                        <option value="${tag.id}" ${tag.id === period.tagId ? 'selected' : ''}>${tag.name}</option>
                    `).join('')}
                </select>
                
                <label>Fecha inicio:</label>
                <input type="date" id="editPeriodStart" value="${period.startDate}" />
                
                <label>Fecha fin:</label>
                <input type="date" id="editPeriodEnd" value="${period.endDate}" min="${period.startDate}" />
                
                <label for="editPeriodLabel">Descripción (opcional):</label>
                <input type="text" id="editPeriodLabel" value="${escapeHtml(period.label || '')}" placeholder="Ej.: Navidad" autocomplete="off" />
                
                <label class="count-mode" for="editPeriodBusinessDays">
                    <input type="checkbox" id="editPeriodBusinessDays" ${period.countMode === COUNT_MODE_BUSINESS ? 'checked' : ''} ${isHolidayTag(period.tagId) ? 'disabled' : ''} />
                    Contar solo días laborables
                </label>
                <span class="count-mode-hint">${isHolidayTag(period.tagId) ? `Los períodos de "${HOLIDAY_TAG_NAME}" cuentan siempre en días naturales` : 'Excluye sábados, domingos y festivos del período'}</span>
                
                <div class="modal-buttons">
                    <button class="btn-primary" onclick="savePeriodEdit('${periodId}')">Guardar</button>
                    <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Sincronizar fecha de fin con fecha de inicio (mismo comportamiento que al crear períodos)
    document.getElementById('editPeriodStart').addEventListener('change', function() {
        const endInput = document.getElementById('editPeriodEnd');
        if (!endInput.value || endInput.value < this.value) {
            endInput.value = this.value;
        }
        endInput.min = this.value;
    });
    
    // Validar que fecha fin no sea anterior a fecha inicio
    document.getElementById('editPeriodEnd').addEventListener('change', function() {
        const startInput = document.getElementById('editPeriodStart');
        if (startInput.value && this.value < startInput.value) {
            this.value = startInput.value;
        }
    });
}

// Guardar edición de período
function savePeriodEdit(periodId) {
    const period = state.periods.find(p => p.id === periodId);
    if (!period) return;
    
    const newTagId = document.getElementById('editPeriodTag').value;
    const newStartDate = document.getElementById('editPeriodStart').value;
    const newEndDate = document.getElementById('editPeriodEnd').value;
    
    if (!newStartDate || !newEndDate) {
        alert('Por favor, selecciona ambas fechas');
        return;
    }
    
    if (parseLocalDate(newStartDate) > parseLocalDate(newEndDate)) {
        alert('La fecha de inicio debe ser anterior a la fecha de fin');
        return;
    }
    
    const newTag = state.tags.find(t => t.id === newTagId);
    if (!newTag) {
        alert('Por favor, selecciona una etiqueta válida');
        return;
    }
    
    const newCountMode = resolveCountMode(newTag.id, document.getElementById('editPeriodBusinessDays').checked
        ? COUNT_MODE_BUSINESS
        : COUNT_MODE_NATURAL);
    const dates = getPeriodDates(newStartDate, newEndDate, newCountMode);

    if (dates.length === 0) {
        alert('El rango seleccionado no contiene ningún día laborable');
        return;
    }
    
    // Eliminar las marcas del período antiguo
    const previousTagId = period.tagId;
    removePeriodMarks(periodId);
    
    // Actualizar el período
    period.tagId = newTag.id;
    period.tagName = newTag.name;
    period.tagColor = newTag.color;
    period.startDate = newStartDate;
    period.endDate = newEndDate;
    period.countMode = newCountMode;
    period.label = document.getElementById('editPeriodLabel').value.trim();
    
    // Remarcar los días con el período actualizado
    applyPeriodMarks(period);
    
    // Si toca a los festivos, el resto de períodos laborables cambia
    if (isHolidayTag(period.tagId) || isHolidayTag(previousTagId)) {
        rebuildBusinessPeriodMarks();
    }
    
    closeModal();
    refreshMarkedDaysViews();
}

// Eliminar período
function deletePeriod(periodId) {
    if (!confirm('¿Estás seguro de eliminar este período?')) {
        return;
    }
    
    const period = state.periods.find(p => p.id === periodId);
    
    // Eliminar las marcas del período
    removePeriodMarks(periodId);
    
    // Eliminar el período de la lista
    state.periods = state.periods.filter(p => p.id !== periodId);
    
    // Quitar un festivo devuelve ese día a los períodos laborables
    if (period && isHolidayTag(period.tagId)) {
        rebuildBusinessPeriodMarks();
    }
    
    refreshMarkedDaysViews();
}

// Eliminar marcas de un período específico
function removePeriodMarks(periodId) {
    for (const date of Object.keys(state.markedDays)) {
        const val = state.markedDays[date];
        const arr = Array.isArray(val) ? val : (val ? [val] : []);
        const filtered = arr.filter(entry => entry.periodId !== periodId);
        if (filtered.length === 0) {
            delete state.markedDays[date];
        } else {
            state.markedDays[date] = filtered;
        }
    }
}

// Cerrar modal
function closeModal() {
    const modal = document.getElementById('editPeriodModal') || document.getElementById('editTagModal');
    if (modal) {
        modal.remove();
    }
}

// Editar etiqueta
function editTag(tagId) {
    const tag = state.tags.find(t => t.id === tagId);
    if (!tag) return;
    
    // Crear modal de edición
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'editTagModal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Editar Etiqueta</h3>
            <div class="modal-form">
                <label>Nombre:</label>
                <input type="text" id="editTagName" value="${escapeHtml(tag.name)}" ${isHolidayTag(tagId) ? 'disabled' : ''} />
                ${isHolidayTag(tagId) ? `<span class="count-mode-hint">"${HOLIDAY_TAG_NAME}" es una etiqueta reservada: solo puedes cambiar su color</span>` : ''}
                
                <label>Color:</label>
                <input type="color" id="editTagColor" value="${tag.color}" />
                
                <div class="modal-buttons">
                    <button class="btn-primary" onclick="saveTagEdit('${tagId}')">Guardar</button>
                    <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Guardar edición de etiqueta
function saveTagEdit(tagId) {
    const tag = state.tags.find(t => t.id === tagId);
    if (!tag) return;
    
    const newColor = document.getElementById('editTagColor').value;
    const newName = isHolidayTag(tagId) ? HOLIDAY_TAG_NAME : document.getElementById('editTagName').value.trim();
    
    if (!newName) {
        alert('Por favor, ingresa un nombre para la etiqueta');
        return;
    }
    
    if (!isHolidayTag(tagId) && normalizeTagName(newName) === normalizeTagName(HOLIDAY_TAG_NAME)) {
        alert(`"${HOLIDAY_TAG_NAME}" es una etiqueta reservada. Elige otro nombre.`);
        return;
    }
    
    if (state.tags.some(t => t.id !== tagId && normalizeTagName(t.name) === normalizeTagName(newName))) {
        alert('Ya existe una etiqueta con ese nombre');
        return;
    }
    
    const oldColor = tag.color;
    
    // Actualizar la etiqueta
    tag.name = newName;
    tag.color = newColor;
    
    // Actualizar las marcas de días que usan esta etiqueta
    for (const date of Object.keys(state.markedDays)) {
        const val = state.markedDays[date];
        const arr = Array.isArray(val) ? val : (val ? [val] : []);
        arr.forEach(entry => {
            if (entry.tagId === tagId) {
                entry.name = newName;
                entry.color = newColor;
            }
        });
    }
    
    // Actualizar los períodos que usan esta etiqueta
    state.periods.forEach(period => {
        if (period.tagId === tagId) {
            period.tagName = newName;
            period.tagColor = newColor;
        }
    });
    
    closeModal();
    renderTagsList();
    renderTagsSelect();
    renderPeriodsList();
    renderCalendar();
    saveToLocalStorage();
}

// Utilidad para quitar marcas de un tag
function removeMarksForTag(tagId) {
    for (const date of Object.keys(state.markedDays)) {
        const val = state.markedDays[date];
        const arr = Array.isArray(val) ? val : (val ? [val] : []);
        const filtered = arr.filter(entry => entry.tagId !== tagId);
        if (filtered.length === 0) {
            delete state.markedDays[date];
        } else {
            state.markedDays[date] = filtered;
        }
    }
}

// Utilidades
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// LocalStorage
function saveToLocalStorage() {
    const data = {
        tags: state.tags,
        markedDays: state.markedDays,
        periods: state.periods,
        startMonth: state.startMonth,
        monthsCount: state.monthsCount,
        highlightWeekends: state.highlightWeekends,
        weekendColor: state.weekendColor
    };
    localStorage.setItem('calendarData', JSON.stringify(data));
}

function loadFromLocalStorage() {
    const data = localStorage.getItem('calendarData');
    if (data) {
        try {
            const parsed = JSON.parse(data);
            // markedDays y periods primero: normalizeTags los reapunta al fusionar
            // etiquetas con el mismo nombre
            state.markedDays = normalizeMarkedDays(parsed.markedDays || {});
            state.periods = normalizePeriods(parsed.periods);
            state.tags = normalizeTags(parsed.tags);
            state.startMonth = parsed.startMonth || state.startMonth;
            state.monthsCount = parsed.monthsCount || 12;
            state.highlightWeekends = parsed.highlightWeekends || false;
            state.weekendColor = parsed.weekendColor || '#ffcccc';
            ensureHolidayTag();
            migrateLegacyHolidays(parsed.holidays, parsed.holidayColor);
            rebuildBusinessPeriodMarks();
            
            // Actualizar inputs
            document.getElementById('startMonth').value = state.startMonth;
            document.getElementById('monthsCount').value = state.monthsCount;
            document.getElementById('highlightWeekends').checked = state.highlightWeekends;
            document.getElementById('weekendColor').value = state.weekendColor;
        } catch (e) {
            console.error('Error al cargar datos:', e);
        }
    }
}

// Normaliza para soportar múltiples etiquetas por día
function normalizeMarkedDays(raw) {
    const normalized = {};
    for (const [date, value] of Object.entries(raw || {})) {
        if (!value) continue;
        if (Array.isArray(value)) {
            if (value.length === 0) continue;
            normalized[date] = value;
        } else {
            normalized[date] = [value];
        }
    }
    return normalized;
}

// Exportar/Importar
function exportData() {
    const data = {
        tags: state.tags,
        markedDays: state.markedDays,
        periods: state.periods,
        startMonth: state.startMonth,
        monthsCount: state.monthsCount,
        exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendario_${formatDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (confirm('¿Deseas reemplazar los datos actuales con los importados?')) {
                // markedDays y periods primero: normalizeTags los reapunta al
                // fusionar etiquetas con el mismo nombre
                state.markedDays = normalizeMarkedDays(data.markedDays || {});
                state.periods = normalizePeriods(data.periods);
                state.tags = normalizeTags(data.tags);
                state.startMonth = data.startMonth || state.startMonth;
                state.monthsCount = data.monthsCount || 12;
                ensureHolidayTag();
                migrateLegacyHolidays(data.holidays, data.holidayColor);
                rebuildBusinessPeriodMarks();
                
                // Actualizar interfaz
                document.getElementById('startMonth').value = state.startMonth;
                document.getElementById('monthsCount').value = state.monthsCount;
                
                renderTagsList();
                renderTagsSelect();
                renderPeriodsList();
                renderCalendar();
                saveToLocalStorage();
                
                alert('Datos importados correctamente');
            }
        } catch (err) {
            alert('Error al importar datos: ' + err.message);
        }
    };
    reader.readAsText(file);
    
    // Limpiar input
    event.target.value = '';
}

// ============================================
// RESPONSIVE - REDIMENSIONADO
// ============================================

let viewportUpdateTimer = null;

function handleViewportUpdate() {
    // Durante la impresión el ancho lo fija prepareForPrint, no la ventana
    if (state.isPrinting) return;

    if (!isMobileLayout()) {
        // Al volver a un layout de escritorio el cajón deja de tener sentido
        closeSidebar();
    }

    if (!state.chart) return;

    const container = document.getElementById('calendar');
    const width = container ? (container.clientWidth || container.offsetWidth) : 0;

    // Un cambio de ancho altera columnas y tamaño de celda, así que hay que
    // volver a construir el calendario; si solo cambia el alto basta con resize().
    if (width && Math.abs(width - (state.lastRenderWidth || 0)) > 1) {
        renderCalendar();
    } else {
        state.chart.resize();
    }
}

function scheduleViewportUpdate() {
    clearTimeout(viewportUpdateTimer);
    viewportUpdateTimer = setTimeout(handleViewportUpdate, 150);
}

window.addEventListener('resize', scheduleViewportUpdate);
window.addEventListener('orientationchange', scheduleViewportUpdate);
