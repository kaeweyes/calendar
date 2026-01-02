import React, { useEffect, useState, useMemo } from "react";

const API_BASE = "http://localhost:4000";

async function fetchEvents() {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) throw new Error("Failed to fetch events");
    return res.json();
}
async function createSeriesOnServer(series) {
    const res = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(series),
    });
    if (!res.ok) throw new Error("Failed to create series");
    return res.json();
}
async function deleteSeriesOnServer(id) {
    const res = await fetch(`${API_BASE}/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete");
    return res.json();
}
async function addExclusionOnServer(id, date) {
    const res = await fetch(`${API_BASE}/events/${encodeURIComponent(id)}/exclude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
    });
    if (!res.ok) throw new Error("Failed to exclude");
    return res.json();
}
async function setEndDateOnServer(id, endDate) {
    const res = await fetch(`${API_BASE}/events/${encodeURIComponent(id)}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate }),
    });
    if (!res.ok) throw new Error("Failed to set end date");
    return res.json();
}

const toISODate = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
};
const parseISODate = (s) => {
    const [y, m, dd] = s.split("-").map((n) => parseInt(n, 10));
    return new Date(y, m - 1, dd);
};
const addDays = (d, n) => {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + n);
    return nd;
};
const weekdayIndex = (date) => date.getDay();
const weekOfMonth = (date) => Math.floor((date.getDate() - 1) / 7) + 1;

const formatDDMMYYYY = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
};
const parseDDMMYYYY = (s) => {
    if (!s) return null;
    const parts = s.split("/");
    if (parts.length !== 3) return null;
    const dd = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    const yyyy = parseInt(parts[2], 10);
    if (Number.isNaN(dd) || Number.isNaN(mm) || Number.isNaN(yyyy)) return null;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return new Date(yyyy, mm - 1, dd);
};
function getDefaultStartEnd() {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const startMins = Math.ceil((mins + 1) / 30) * 30;
    const endMins = startMins + 30;
    const pad2 = (n) => String(n).padStart(2, "0");
    const h1 = Math.floor(startMins / 60) % 24;
    const m1 = startMins % 60;
    const h2 = Math.floor(endMins / 60) % 24;
    const m2 = endMins % 60;
    return { start: `${pad2(h1)}:${pad2(m1)}`, end: `${pad2(h2)}:${pad2(m2)}` };
}
function normalizeRepeat(series) {
    if (series.repeatWeeks || series.repeatFreq) return series;

    const s = { ...series };
    if (!s.repeat) {
        s.repeatWeeks = [];
        s.repeatFreq = 'daily';
        return s;
    }

    const repeats = Array.isArray(s.repeat) ? s.repeat : [s.repeat];
    const weekOpts = repeats.filter(r => /^week\d$/.test(r));
    const freq = repeats.find(r => ['daily', 'monthly', 'quarterly', 'none', 'weekly'].includes(r));
    s.repeatWeeks = weekOpts;
    if (freq === 'weekly') {
        s.repeatFreq = 'monthly';
    } else if (freq === 'none' || !freq) {
        s.repeatFreq = 'none';
    } else {
        s.repeatFreq = freq || 'daily';
    }
    return s;
}

function occurrencesForSeriesInRange(seriesRaw, monthStart, monthEnd) {
    const series = normalizeRepeat(seriesRaw);
    const results = [];
    const start = parseISODate(series.startDate);
    const repeatWeeks = Array.isArray(series.repeatWeeks) ? series.repeatWeeks : [];
    const repeatFreq = series.repeatFreq || 'daily';
    const ex = new Set(series.exclusions || []);
    const endDate = series.endDate ? parseISODate(series.endDate) : null;

    if (start > monthEnd && repeatFreq === 'none' && repeatWeeks.length === 0) return results;

    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
        const ds = toISODate(d);
        if (endDate && d > endDate) break;
        if (d < start && repeatFreq === 'none' && repeatWeeks.length === 0) continue;

        let match = false;

        const monthsDiff = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());

        if (repeatWeeks.length) {
            let freqOk = false;
            if (repeatFreq === 'daily') {
                freqOk = monthsDiff >= 0;
            } else if (repeatFreq === 'monthly') {
                freqOk = monthsDiff >= 0;
            } else if (repeatFreq === 'quarterly') {
                freqOk = monthsDiff >= 0 && monthsDiff % 3 === 0;
            } else if (repeatFreq === 'none') {
                freqOk = false;
            } else {
                freqOk = monthsDiff >= 0;
            }

            if (freqOk && d >= start && weekdayIndex(d) === weekdayIndex(start)) {
                const wom = weekOfMonth(d);
                if (repeatWeeks.includes(`week${wom}`)) match = true;
            }
        } else {
            if (repeatFreq === 'none') {
                if (ds === series.startDate) match = true;
            } else if (repeatFreq === 'daily') {
                if (d >= start) match = true;
            } else if (repeatFreq === 'monthly') {
                if (d >= start && d.getDate() === start.getDate()) match = true;
            } else if (repeatFreq === 'quarterly') {
                if (d >= start && d.getDate() === start.getDate() && monthsDiff % 3 === 0) match = true;
            }
        }

        if (!match && ds === series.startDate) match = true;

        if (match && !ex.has(ds)) {
            results.push({
                date: ds,
                seriesId: series.id,
                name: series.name,
                startTime: series.startTime,
                endTime: series.endTime,
                repeat: { repeatWeeks: series.repeatWeeks || [], repeatFreq: series.repeatFreq || 'none' },
            });
        }
    }

    return results;
}

const styles = {
    app: { fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial", padding: 12 },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
    navbar: { padding: 8 },
    navbarList: { display: "flex", gap: 6, listStyle: "none", padding: 0, margin: 0, flexWrap: "wrap" },
    monthButton: {
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #bbb",
        background: "#fff",
        cursor: "pointer",
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: 0.6,
    },
    activeMonthButton: { background: "#2563eb", color: "white", border: "1px solid #2563eb", fontWeight: 800, fontSize: 18 },
    table: { borderCollapse: "collapse", width: "100%" },
    th: { border: "1px solid #ddd", padding: 8, background: "#fafafa", textAlign: "center" },
    td: { border: "1px solid #ccc", verticalAlign: "top", padding: 8, minWidth: 120, height: 92, position: "relative", cursor: "pointer" },
    dateNumber: { position: "absolute", right: 8, top: 8, fontSize: 16, color: "maroon", fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700 },
    today: { color: "crimson" },
    popupOverlay: { position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", zIndex: 9999, padding: "1rem" },
    popupModal: { position: "relative", minWidth: 320, maxWidth: "92%", maxHeight: "92%", overflow: "auto", background: "white", borderRadius: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.25)", padding: "1.25rem" },
    closeButton: { position: "absolute", right: 8, top: 8, border: "none", background: "transparent", fontSize: 20, lineHeight: 1, cursor: "pointer" },
    eventPreview: { borderRadius: 6, padding: "6px 8px", background: "#eef", display: "inline-block", maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    formInput: { width: "100%", padding: "6px 8px", boxSizing: "border-box", marginTop: 6, marginBottom: 6 },
    smallBtn: { padding: "6px 8px", borderRadius: 6, border: "1px solid #aaa", cursor: "pointer" },
    layout: { display: 'flex', gap: 12, alignItems: 'flex-start' },
    sidePanel: { width: 340, border: '1px solid #e6e6e6', borderRadius: 8, padding: 12, background: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,0.06)' },
    noEvents: { color: "maroon", fontSize: 14, fontFamily: "Georgia, 'Times New Roman', serif", opacity: 0.95 },
    popupNoEvents: { padding: 8, color: "maroon", fontSize: 14, fontFamily: "Georgia, 'Times New Roman', serif" },
};

const Navbar = ({ selectedMonth, onMonthClick }) => {
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUNE", "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"];

    return (
        <nav style={styles.navbar}>
            <ul style={styles.navbarList}>
                {months.map((m, i) => {
                    const isActive = i === selectedMonth;

                    return (
                        <li key={m}>
                            <button
                                onClick={() => onMonthClick(i)}
                                style={{
                                    ...styles.monthButton,
                                    ...(isActive ? styles.activeMonthButton : {}),
                                }}
                            >
                                {m}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};

const Popup = ({ children, onClose, title }) => {
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        document.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [onClose]);

    return (
        <div style={styles.popupOverlay} onClick={onClose}>
            <div style={styles.popupModal} onClick={(e) => e.stopPropagation()}>
                <button aria-label="Close" onClick={onClose} style={styles.closeButton}>
                    ✕
                </button>
                {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
                <div>{children}</div>
            </div>
        </div>
    );
};

const Table = ({ year, month, seriesArray, onServerRefresh, onCreateFromDay }) => {
    const [openCell, setOpenCell] = useState(null);
    const [fileError, setFileError] = useState(null);
    const [dragOverDate, setDragOverDate] = useState(null);
    const [editOcc, setEditOcc] = useState(null);

    const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const occurrences = useMemo(() => {
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        const map = {};
        for (const s of seriesArray) {
            try {
                const occs = occurrencesForSeriesInRange(s, monthStart, monthEnd);
                for (const o of occs) {
                    map[o.date] = map[o.date] || [];
                    map[o.date].push(o);
                }
            } catch (e) {
                console.error("occ gen error", e);
            }
        }
        Object.keys(map).forEach((k) =>
            map[k].sort((a, b) => (a.startTime || "") > (b.startTime || "") ? 1 : -1)
        );
        return map;
    }, [seriesArray, year, month]);

    const calendarGrid = useMemo(() => {
        const start = new Date(year, month, 1);
        const startOnMonday = new Date(start);
        const day = startOnMonday.getDay();
        const offset = day === 0 ? -6 : 1 - day;
        startOnMonday.setDate(startOnMonday.getDate() + offset);

        const rows = [];
        let cur = new Date(startOnMonday);
        for (let w = 0; w < 6; w++) {
            const row = [];
            for (let wd = 0; wd < 7; wd++) {
                const inMonth = cur.getMonth() === month;
                const ds = toISODate(cur);
                row.push({
                    date: new Date(cur),
                    dateStr: ds,
                    inMonth,
                    occurrences: occurrences[ds] || [],
                });
                cur = addDays(cur, 1);
            }
            rows.push(row);
        }
        return rows;
    }, [month, year, occurrences]);

    async function refreshFromServer() {
        try {
            const arr = await fetchEvents();
            onServerRefresh(arr);
        } catch (err) {
            setFileError(err.message || String(err));
        }
    }

    async function handleDeleteOccurrence(seriesId, dateStr) {
        try {
            await addExclusionOnServer(seriesId, dateStr);
            await refreshFromServer();
            setOpenCell(null);
        } catch (err) {
            setFileError(err.message || String(err));
        }
    }

    async function handleRemoveSeriesFrom(seriesId, fromDateStr) {
        try {
            const fromDate = parseISODate(fromDateStr);
            const dayBefore = toISODate(addDays(fromDate, -1));
            await setEndDateOnServer(seriesId, dayBefore);
            await refreshFromServer();
            setOpenCell(null);
        } catch (err) {
            setFileError(err.message || String(err));
        }
    }

    async function handleDeleteSeries(seriesId) {
        try {
            await deleteSeriesOnServer(seriesId);
            await refreshFromServer();
            setOpenCell(null);
        } catch (err) {
            setFileError(err.message || String(err));
        }
    }

    async function handleMoveOccurrence(seriesId, fromDateStr, toDateStr, occ) {
        if (fromDateStr === toDateStr) return;
        try {
            await addExclusionOnServer(seriesId, fromDateStr);

            const newSeries = {
                id: `ts-${Date.now()}`,
                name: occ.name,
                startDate: toDateStr,
                startTime: occ.startTime || null,
                endTime: occ.endTime || null,
                repeatWeeks: [],
                repeatFreq: 'none',
                exclusions: [],
                endDate: null,
                createdAt: new Date().toISOString(),
            };

            await createSeriesOnServer(newSeries);
            await refreshFromServer();
            setOpenCell(null);
        } catch (err) {
            setFileError(err.message || String(err));
        }
    }

    async function handleEditOccurrence(seriesId, originalDate, updated) {
        try {
            const newSeries = {
                id: `ts-${Date.now()}`,
                name: updated.name,
                startDate: updated.date,
                startTime: updated.startTime || null,
                endTime: updated.endTime || null,
                repeatWeeks: [],
                repeatFreq: 'none',
                exclusions: [],
                endDate: null,
                createdAt: new Date().toISOString(),
            };

            await createSeriesOnServer(newSeries);

            if (updated._originalWasSingle) {
                await deleteSeriesOnServer(seriesId);
            } else {
                await addExclusionOnServer(seriesId, originalDate);
            }

            await refreshFromServer();
            setEditOcc(null);
            setOpenCell(null);
        } catch (err) {
            setFileError(err.message || String(err));
        }
    }

    return (
        <div>
            {fileError && <div style={{ color: "red" }}>File error: {fileError}</div>}
            <table style={styles.table}>
                <thead>
                    <tr>
                        {weekdayNames.map((d) => (
                            <th key={d} style={styles.th}>
                                {d}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {calendarGrid.map((row, rI) => (
                        <tr key={rI}>
                            {row.map((cell) => {
                                const events = cell.occurrences || [];
                                const isDragOver = dragOverDate === cell.dateStr;

                                const first = events && events.length ? events[0] : null;
                                const moreCount = events.length > 1 ? events.length - 1 : 0;

                                return (
                                    <td
                                        key={cell.dateStr}
                                        onClick={() => setOpenCell(cell)}
                                        onDragOver={(e) => { e.preventDefault(); }}
                                        onDragEnter={(e) => { e.preventDefault(); setDragOverDate(cell.dateStr); }}
                                        onDragLeave={() => setDragOverDate(null)}
                                        onDrop={async (e) => {
                                            try {
                                                e.preventDefault();
                                                setDragOverDate(null);
                                                const payload = e.dataTransfer.getData('application/json');
                                                if (!payload) return;
                                                const data = JSON.parse(payload);
                                                await handleMoveOccurrence(data.seriesId, data.date, cell.dateStr, data);
                                            } catch (err) {
                                                setFileError(String(err));
                                            }
                                        }}
                                        style={{
                                            ...styles.td,
                                            background: isDragOver ? '#eef6ff' : (cell.inMonth ? "#fff" : "#f8f8f8"),
                                        }}
                                    >
                                        <div style={styles.dateNumber}>
                                            {cell.date.getDate()}
                                        </div>

                                        <div style={{ marginTop: 36, fontSize: 13 }}>
                                            {first ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 92 }}>
                                                    <div
                                                        key={`${first.seriesId}-${first.date}`}
                                                        style={{ ...styles.eventPreview, cursor: 'move' }}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.stopPropagation();
                                                            e.dataTransfer.setData('application/json', JSON.stringify({ seriesId: first.seriesId, date: first.date, name: first.name, startTime: first.startTime, endTime: first.endTime, repeat: first.repeat }));
                                                            e.dataTransfer.effectAllowed = 'move';
                                                        }}
                                                        onClick={(e) => { e.stopPropagation(); setEditOcc({ occ: first, fromDate: first.date }); }}
                                                    >
                                                        <div style={{ fontWeight: 600 }}>{first.name}</div>
                                                        <div style={{ fontSize: 12 }}>{first.startTime || ""} {first.startTime && first.endTime ? "—" : ""} {first.endTime || ""}</div>
                                                    </div>

                                                    {moreCount ? (
                                                        <div style={{ fontSize: 12, color: '#666' }}>+{moreCount} more</div>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <div style={styles.noEvents}>No events</div>
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>

            {openCell && (
                <Popup onClose={() => setOpenCell(null)} title={`Events — ${openCell.dateStr}`}>
                    <div>
                        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                            {openCell.occurrences && openCell.occurrences.length > 0 ? (
                                openCell.occurrences.map((o) => (
                                    <div
                                        key={`${o.seriesId}-${o.date}`}
                                        style={{ padding: 8, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 700 }}>{o.name}</div>
                                            <div style={{ fontSize: 12 }}>
                                                {o.startTime || ""} {o.endTime ? `— ${o.endTime}` : ""} {" "}
                                                <span style={{ marginLeft: 8, fontStyle: "italic", color: "#666", fontSize: 12 }}>
                                                    {o.repeat.repeatWeeks && o.repeat.repeatWeeks.length ? `${o.repeat.repeatWeeks.join(', ')} ` : ''}{o.repeat.repeatFreq}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button style={styles.smallBtn} onClick={() => handleDeleteOccurrence(o.seriesId, o.date)}>
                                                Remove
                                            </button>
                                            {(o.repeat.repeatWeeks && o.repeat.repeatWeeks.length) || (o.repeat.repeatFreq && o.repeat.repeatFreq !== 'none') ? (
                                                <button style={styles.smallBtn} onClick={() => handleRemoveSeriesFrom(o.seriesId, o.date)}>
                                                    Remove all future
                                                </button>
                                            ) : null}
                                            <button style={styles.smallBtn} onClick={() => handleDeleteSeries(o.seriesId)}>
                                                Remove series
                                            </button>
                                            <button style={styles.smallBtn} onClick={() => setEditOcc({ occ: o, fromDate: o.date })}>
                                                Edit
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={styles.popupNoEvents}>No events on this day</div>
                            )}
                        </div>

                        <div style={{ marginTop: 12 }}>
                            <button
                                style={styles.smallBtn}
                                onClick={() => {
                                    onCreateFromDay(openCell.dateStr);
                                    setOpenCell(null);
                                }}
                            >
                                Create event on this day
                            </button>
                            <button style={{ ...styles.smallBtn, marginLeft: 8 }} onClick={() => setOpenCell(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </Popup>
            )}

            {editOcc && (
                <EditEventPopup
                    occ={editOcc.occ}
                    originalDate={editOcc.fromDate}
                    onClose={() => setEditOcc(null)}
                    onSave={async (updated) => {
                        const originalWasSingle = (!editOcc.occ.repeat || (editOcc.occ.repeat.repeatFreq === 'none' && (!editOcc.occ.repeat.repeatWeeks || editOcc.occ.repeat.repeatWeeks.length === 0)));
                        await handleEditOccurrence(editOcc.occ.seriesId, editOcc.fromDate, { ...updated, _originalWasSingle: originalWasSingle });
                    }}
                />
            )}
        </div>
    );
};

const EditEventPopup = ({ occ, originalDate, onClose, onSave }) => {
    const [name, setName] = useState(occ.name || "");
    const [date, setDate] = useState(occ.date || originalDate || toISODate(new Date()));
    const [startTime, setStartTime] = useState(occ.startTime || "");
    const [endTime, setEndTime] = useState(occ.endTime || "");

    return (
        <Popup onClose={onClose} title={`Edit event — ${originalDate}`}>
            <form onSubmit={(e) => { e.preventDefault(); onSave({ name, date, startTime, endTime }); }} style={{ display: 'grid', gap: 8 }}>
                <label>
                    Event name
                    <input style={styles.formInput} value={name} onChange={(e) => setName(e.target.value)} />
                </label>

                <label>
                    Date
                    <input style={styles.formInput} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>

                <label>
                    Start time
                    <input style={styles.formInput} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </label>

                <label>
                    End time
                    <input style={styles.formInput} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </label>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" style={styles.smallBtn}>Save</button>
                    <button type="button" style={styles.smallBtn} onClick={onClose}>Cancel</button>
                </div>
            </form>
        </Popup>
    );
};

const CreateEventPanel = ({ defaultDate, onCreate, onCancel, recentNames = [] }) => {
    const [name, setName] = useState("");

    const normalizeToDD = (d) => {
        if (!d) return formatDDMMYYYY(new Date());
        if (d.includes('/')) return d;
        try {
            const parsed = parseISODate(d);
            if (parsed && !Number.isNaN(parsed.getTime())) return formatDDMMYYYY(parsed);
        } catch (e) { }
        return formatDDMMYYYY(new Date());
    };

    const defaultDD = normalizeToDD(defaultDate);
    const defaultTimes = getDefaultStartEnd();

    const [date, setDate] = useState(defaultDD);
    const [startTime, setStartTime] = useState(defaultTimes.start);
    const [endTime, setEndTime] = useState(defaultTimes.end);
    const [repeatWeeks, setRepeatWeeks] = useState([]);
    const [repeatFreq, setRepeatFreq] = useState('none');

    useEffect(() => {
        setDate(normalizeToDD(defaultDate));
        const dt = getDefaultStartEnd();
        setStartTime(dt.start);
        setEndTime(dt.end);
    }, [defaultDate]);

    function toggleWeek(val) {
        setRepeatWeeks(prev => {
            if (prev.includes(val)) return prev.filter(x => x !== val);
            return [...prev, val];
        });
    }

    function mkSeries() {
        const parsed = parseDDMMYYYY(date);
        const iso = parsed ? toISODate(parsed) : toISODate(new Date());
        return {
            id: `ts-${Date.now()}`,
            name: name || "Untitled",
            startDate: iso,
            startTime: startTime || null,
            endTime: endTime || null,
            repeatWeeks: repeatWeeks,
            repeatFreq: repeatFreq || 'none',
            exclusions: [],
            endDate: null,
            createdAt: new Date().toISOString(),
        };
    }

    return (
        <div style={styles.sidePanel}>
            <h3 style={{ marginTop: 0 }}>Create event</h3>
            <form onSubmit={(e) => { e.preventDefault(); onCreate(mkSeries()); }} style={{ display: 'grid', gap: 8 }}>
                <label>
                    Event name
                    <input
                        list="name-suggestions"
                        style={styles.formInput}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Event name"
                    />
                    <datalist id="name-suggestions">
                        {recentNames.map((n, idx) => <option key={idx} value={n} />)}
                    </datalist>
                </label>

                <label>
                    Date (dd/mm/yyyy)
                    <input
                        style={styles.formInput}
                        type="text"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        placeholder="dd/mm/yyyy"
                    />
                </label>

                <label>
                    Start time
                    <input style={styles.formInput} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </label>

                <label>
                    End time
                    <input style={styles.formInput} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </label>

                <div>
                    <div style={{ marginBottom: 6 }}>Recurrence:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {['none', 'daily', 'monthly', 'quarterly'].map(freq => (
                            <label key={freq} style={{ fontSize: 14 }}>
                                <input type="radio" name="freq" checked={repeatFreq === freq} onChange={() => setRepeatFreq(freq)} style={{ marginRight: 8 }} />
                                {freq === 'none' ? 'Do Not Repeat' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                            </label>
                        ))}
                    </div>
                </div>

                {(repeatFreq === 'monthly' || repeatFreq === 'quarterly') && (
                    <div>
                        <div style={{ marginBottom: 6 }}>Which weeks (optional)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {['week1', 'week2', 'week3', 'week4'].map(w => (
                                <label key={w} style={{ fontSize: 14 }}>
                                    <input type="checkbox" checked={repeatWeeks.includes(w)} onChange={() => toggleWeek(w)} style={{ marginRight: 8 }} />
                                    {w}
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="submit" style={styles.smallBtn}>Create</button>
                    <button type="button" style={styles.smallBtn} onClick={onCancel}>Cancel</button>
                </div>
            </form>
        </div>
    );
};

export default function App() {
    const today = new Date();

    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    let initialYear = today.getFullYear();
    let initialMonth = today.getMonth();
    try {
        const y = params.get('year');
        const m = params.get('month');
        if (y && !Number.isNaN(parseInt(y, 10))) initialYear = parseInt(y, 10);
        if (m && !Number.isNaN(parseInt(m, 10))) {
            const mm = parseInt(m, 10);
            if (mm >= 0 && mm <= 11) initialMonth = mm;
        }
    } catch (e) {
    }

    const [viewYear] = useState(initialYear);
    const [viewMonth, setViewMonth] = useState(initialMonth);
    const [seriesArray, setSeriesArray] = useState([]);
    const [showSideCreate, setShowSideCreate] = useState(true);
    const [createDefaultDate, setCreateDefaultDate] = useState(null);
    const [fileErr, setFileErr] = useState(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const arr = await fetchEvents();
                if (mounted) setSeriesArray(arr);
            } catch (err) {
                setFileErr(err.message || String(err));
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const recentNames = useMemo(() => {
        const seriesNames = Array.isArray(seriesArray) ? seriesArray
            .slice()
            .sort((a, b) => {
                const ta = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const tb = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return tb - ta;
            })
            .map(s => s && s.name).filter(Boolean) : [];
        const uniq = [];
        for (const n of seriesNames) {
            if (!uniq.includes(n)) uniq.push(n);
            if (uniq.length >= 20) break;
        }
        return uniq;
    }, [seriesArray]);

    async function handleMonthClick(monthIndex) {
        setViewMonth(monthIndex);
    }

    async function handleCreate(series) {
        try {
            await createSeriesOnServer(series);
            const arr = await fetchEvents();
            setSeriesArray(arr);
            setCreateDefaultDate(null);
        } catch (err) {
            setFileErr(err.message || String(err));
        }
    }

    async function handleServerRefresh(arr) {
        setSeriesArray(arr);
    }

    function handleCreateFromDay(dateStr) {
        setCreateDefaultDate(dateStr);
        setShowSideCreate(true);
    }

    return (
        <div style={styles.app}>
            <div style={styles.header}>
                <h2 style={{ margin: 0 }}>My Local Calendar</h2>
                <div />
            </div>

            <Navbar selectedMonth={viewMonth} onMonthClick={handleMonthClick} />

            <div style={{ marginTop: 12 }}>
                <div style={styles.layout}>
                    <div style={{ flex: 1 }}>
                        <Table year={viewYear} month={viewMonth} seriesArray={seriesArray} onServerRefresh={handleServerRefresh} onCreateFromDay={handleCreateFromDay} />
                    </div>

                    {showSideCreate && (
                        <CreateEventPanel
                            defaultDate={createDefaultDate || toISODate(new Date(viewYear, viewMonth, today.getDate()))}
                            onClose={() => setShowSideCreate(false)}
                            onCreate={async (series) => {
                                await handleCreate(series);
                            }}
                            onCancel={() => { setCreateDefaultDate(null); setShowSideCreate(false); }}
                            recentNames={recentNames}
                        />
                    )}
                </div>

                <div style={{ marginTop: 12 }}>
                    <button style={styles.smallBtn} onClick={() => { window.location.href = '/'; }}>
                        Back to Dashboard
                    </button>
                </div>
            </div>

            {fileErr && <div style={{ color: "red", marginTop: 8 }}>{fileErr}</div>}

            <div style={{ marginTop: 12, color: "#666", fontSize: 13 }}>
                Events served from <code>{API_BASE}/events</code>
            </div>
        </div>
    );
}
