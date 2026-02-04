// Función para calcular luminosidad de un color y determinar si el texto debe ser claro u oscuro
function getContrastColor(hexColor) {
    if (!hexColor) return '#555';
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
    periods: [], // { id: "period_123", tagId: "tag1", startDate: "2024-01-15", endDate: "2024-01-20", tagName: "Vacaciones", tagColor: "#3498db" }
    startMonth: null,
    monthsCount: 12,
    chart: null,
    highlightWeekends: false,
    weekendColor: '#ffcccc'
};

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', function() {
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
    
    // Renderizar interfaz
    renderTagsList();
    renderTagsSelect();
    renderPeriodsList();
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
    
    // Generar leyenda antes de imprimir
    window.addEventListener('beforeprint', generatePrintLegend);
}

// Generar leyenda para impresión
function generatePrintLegend() {
    const legendContent = document.getElementById('legendContent');
    legendContent.innerHTML = '';
    
    // Añadir etiquetas usadas
    state.tags.forEach(tag => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <span class="legend-color" style="background-color: ${tag.color};"></span>
            <span class="legend-name">${tag.name}</span>
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
    
    const tag = {
        id: `tag_${Date.now()}`,
        name: name,
        color: color
    };
    
    state.tags.push(tag);
    
    // Limpiar inputs
    nameInput.value = '';
    colorInput.value = '#3498db';
    
    // Actualizar interfaz
    renderTagsList();
    renderTagsSelect();
    saveToLocalStorage();
}

function deleteTag(tagId) {
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

function renderTagsList() {
    const container = document.getElementById('tagsList');
    
    if (state.tags.length === 0) {
        container.innerHTML = '<p style="color: #95a5a6; font-size: 14px; text-align: center;">No hay etiquetas</p>';
        return;
    }
    
    container.innerHTML = state.tags.map(tag => `
        <div class="tag-item">
            <div class="tag-info">
                <div class="tag-color-box" style="background: ${tag.color};"></div>
                <span class="tag-name">${tag.name}</span>
            </div>
            <div class="tag-actions">
                <button class="tag-edit" onclick="editTag('${tag.id}')" title="Editar etiqueta" aria-label="Editar">✏️</button>
                <button class="tag-delete" onclick="deleteTag('${tag.id}')" aria-label="Eliminar">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderTagsSelect() {
    const select = document.getElementById('selectedTag');
    
    if (state.tags.length === 0) {
        select.innerHTML = '<option value="">-- Sin etiquetas --</option>';
        return;
    }
    
    select.innerHTML = '<option value="">-- Seleccionar --</option>' + 
        state.tags.map(tag => `
            <option value="${tag.id}">${tag.name}</option>
        `).join('');
}

// Marcar días
function markRange() {
    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');
    const tagSelect = document.getElementById('selectedTag');
    
    const startDate = new Date(startInput.value);
    const endDate = new Date(endInput.value);
    const tagId = tagSelect.value;
    
    if (!startInput.value || !endInput.value) {
        alert('Por favor, selecciona ambas fechas');
        return;
    }
    
    if (!tagId) {
        alert('Por favor, selecciona una etiqueta');
        return;
    }
    
    if (startDate > endDate) {
        alert('La fecha de inicio debe ser anterior a la fecha de fin');
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
        tagColor: tag.color
    };
    state.periods.push(period);
    
    // Marcar todos los días en el rango
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const dateStr = formatDate(currentDate);
        const current = Array.isArray(state.markedDays[dateStr]) ? state.markedDays[dateStr] : (state.markedDays[dateStr] ? [state.markedDays[dateStr]] : []);
        const exists = current.some(entry => entry.tagId === tag.id);
        if (!exists) {
            current.push({ tagId: tag.id, color: tag.color, name: tag.name, periodId: period.id });
        }
        state.markedDays[dateStr] = current;
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    renderPeriodsList();
    renderCalendar();
    saveToLocalStorage();
    
    // Limpiar inputs
    startInput.value = '';
    endInput.value = '';
}

function clearSelection() {
    if (!confirm('¿Estás seguro de limpiar todos los días marcados?')) {
        return;
    }
    
    state.markedDays = {};
    state.periods = [];
    renderPeriodsList();
    renderCalendar();
    saveToLocalStorage();
}

// Actualizar período
function updatePeriod() {
    const startMonthInput = document.getElementById('startMonth');
    const monthsCountInput = document.getElementById('monthsCount');
    
    state.startMonth = startMonthInput.value;
    state.monthsCount = parseInt(monthsCountInput.value);
    
    if (!state.startMonth) {
        alert('Por favor, selecciona un mes de inicio');
        return;
    }
    
    if (state.monthsCount < 1 || state.monthsCount > 36) {
        alert('El número de meses debe estar entre 1 y 36');
        return;
    }
    
    renderCalendar();
    saveToLocalStorage();
}

// Renderizar calendario con ECharts
function renderCalendar() {
    const container = document.getElementById('calendar');
    
    if (!state.chart) {
        state.chart = echarts.init(container);
    }
    
    // Calcular fechas
    const [year, month] = state.startMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    
    // Generar configuración de calendarios
    const calendars = [];
    const series = [];
    const graphics = [];
    const columns = Math.min(3, Math.max(1, state.monthsCount));
    const widthPercent = 100 / columns;
    const containerWidth = container.clientWidth || container.offsetWidth || 800;
    const topOffsetPx = 120; // espacio para título general
    const gapY = 90; // espacio entre filas de meses (incluye título)
    const cellHeightPx = 26; // tamaño fijo de celda para todos los meses
    const calendarPadPx = 30; // espacio extra para labels de días
    const calendarWidthPx = (containerWidth * (widthPercent - 3) / 100);
    const cellWidthPx = Math.max(18, calendarWidthPx / 7 - 2);
    
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
                    color: '#ddd',
                    width: 1,
                    type: 'solid'
                }
            },
            yearLabel: { show: false },
            dayLabel: {
                nameMap: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
                firstDay: 1,
                position: 'start'
            },
            monthLabel: {
                nameMap: 'es',
                formatter: '{yyyy}-{MM}',
                show: false
            },
            itemStyle: {
                color: '#f0f0f0',
                borderWidth: 1,
                borderColor: '#ccc'
            }
        });

        graphics.push({
            type: 'text',
            left: `${leftPercent}%`,
            right: `${100 - leftPercent - (widthPercent - 3)}%`,
            top: Math.max(0, topPx - 56),
            style: {
                text: monthText,
                fill: '#333',
                fontWeight: 'bold',
                fontSize: 14,
                textAlign: 'center'
            }
        });

        // Preparar datos para este mes
        const monthRange = `${adjustedYear}-${String(adjustedMonth).padStart(2, '0')}`;
        const monthData = [];
        
        Object.entries(state.markedDays).forEach(([date, tags]) => {
            if (date.startsWith(monthRange)) {
                const tagArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
                if (tagArray.length > 0) {
                    monthData.push({
                        date: date,
                        tags: tagArray.map(t => ({
                            color: t.color || '#3498db',
                            name: t.name || 'Etiqueta'
                        }))
                    });
                }
            }
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
                        symbolSize: [cellWidthPx - 4, stripeH],
                        symbolOffset: [0, offsetY],
                        itemStyle: {
                            color: tag.color,
                            borderColor: '#fff',
                            borderWidth: 0.5
                        },
                        tooltip: {
                            formatter: function() {
                                const lines = item.tags.map(t => 
                                    `<span style="display:inline-block;width:12px;height:12px;background:${t.color};margin-right:8px;border-radius:2px;vertical-align:middle;"></span>${t.name}`
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
            // Verificar si es fin de semana
            const dateObj = new Date(d);
            const dayOfWeek = dateObj.getDay(); // 0=Dom, 6=Sáb
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            const effectiveBgColor = bgColor || (state.highlightWeekends && isWeekend ? state.weekendColor : null);
            const textColor = effectiveBgColor ? getContrastColor(effectiveBgColor) : '#555';
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
                const dateObj = new Date(d);
                const dayOfWeek = dateObj.getDay();
                return (dayOfWeek === 0 || dayOfWeek === 6) && !state.markedDays[d];
            });
            
            if (weekendDays.length > 0) {
                series.push({
                    type: 'scatter',
                    coordinateSystem: 'calendar',
                    calendarIndex: i,
                    data: weekendDays.map(d => [d, 1]),
                    z: 5,
                    symbol: 'rect',
                    symbolSize: [cellWidthPx - 2, cellHeightPx - 2],
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
                color: '#555',
                fontSize: 10,
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
    const totalHeightPx = currentTopPx + rowMaxHeight + gapY + 40;
    container.style.height = `${totalHeightPx}px`;
    container.style.minHeight = `${totalHeightPx}px`;

    const option = {
        title: {
            text: 'Calendario',
            left: 'center',
            top: 10,
            textStyle: {
                fontSize: 24,
                fontWeight: 'bold'
            }
        },
        tooltip: {
            trigger: 'item',
            confine: true
        },
        calendar: calendars,
        graphic: graphics,
        series: series
    };
    
    state.chart.setOption(option, true);
    state.chart.resize();
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
        container.innerHTML = '<p style="color: #95a5a6; font-size: 14px; text-align: center;">No hay períodos marcados</p>';
        return;
    }
    
    container.innerHTML = state.periods.map(period => `
        <div class="period-item" data-id="${period.id}">
            <div class="period-info">
                <div class="period-color-box" style="background: ${period.tagColor};"></div>
                <div class="period-details">
                    <span class="period-tag-name">${period.tagName}</span>
                    <span class="period-dates">${formatDisplayDate(period.startDate)} - ${formatDisplayDate(period.endDate)}</span>
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
    
    if (new Date(newStartDate) > new Date(newEndDate)) {
        alert('La fecha de inicio debe ser anterior a la fecha de fin');
        return;
    }
    
    const newTag = state.tags.find(t => t.id === newTagId);
    if (!newTag) {
        alert('Por favor, selecciona una etiqueta válida');
        return;
    }
    
    // Eliminar las marcas del período antiguo
    removePeriodMarks(periodId);
    
    // Actualizar el período
    period.tagId = newTag.id;
    period.tagName = newTag.name;
    period.tagColor = newTag.color;
    period.startDate = newStartDate;
    period.endDate = newEndDate;
    
    // Remarcar los días con el período actualizado
    let currentDate = new Date(newStartDate);
    const endDate = new Date(newEndDate);
    while (currentDate <= endDate) {
        const dateStr = formatDate(currentDate);
        const current = Array.isArray(state.markedDays[dateStr]) ? state.markedDays[dateStr] : (state.markedDays[dateStr] ? [state.markedDays[dateStr]] : []);
        const exists = current.some(entry => entry.periodId === periodId);
        if (!exists) {
            current.push({ tagId: newTag.id, color: newTag.color, name: newTag.name, periodId: periodId });
        }
        state.markedDays[dateStr] = current;
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    closeModal();
    renderPeriodsList();
    renderCalendar();
    saveToLocalStorage();
}

// Eliminar período
function deletePeriod(periodId) {
    if (!confirm('¿Estás seguro de eliminar este período?')) {
        return;
    }
    
    // Eliminar las marcas del período
    removePeriodMarks(periodId);
    
    // Eliminar el período de la lista
    state.periods = state.periods.filter(p => p.id !== periodId);
    
    renderPeriodsList();
    renderCalendar();
    saveToLocalStorage();
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
                <input type="text" id="editTagName" value="${tag.name}" />
                
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
    
    const newName = document.getElementById('editTagName').value.trim();
    const newColor = document.getElementById('editTagColor').value;
    
    if (!newName) {
        alert('Por favor, ingresa un nombre para la etiqueta');
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
            state.tags = parsed.tags || [];
            state.markedDays = normalizeMarkedDays(parsed.markedDays || {});
            state.periods = parsed.periods || [];
            state.startMonth = parsed.startMonth || state.startMonth;
            state.monthsCount = parsed.monthsCount || 12;
            state.highlightWeekends = parsed.highlightWeekends || false;
            state.weekendColor = parsed.weekendColor || '#ffcccc';
            
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
                state.tags = data.tags || [];
                state.markedDays = data.markedDays || {};
                state.periods = data.periods || [];
                state.startMonth = data.startMonth || state.startMonth;
                state.monthsCount = data.monthsCount || 12;
                
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

// Responsive - redimensionar calendario
window.addEventListener('resize', function() {
    if (state.chart) {
        state.chart.resize();
    }
});
