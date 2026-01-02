// Initial author Siddarth
import React, { useEffect, useMemo, useState, useRef } from "react";
//import { RiDeleteBin6Line } from "react-icons/ri";
//import { MdRemoveCircleOutline } from "react-icons/md";
import { TiDeleteOutline } from "react-icons/ti";

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

    if (res.status === 201) {
        const json = await res.json();
        return { created: true, series: json };
    } else if (res.status === 409) {
        const json = await res.json().catch(() => ({}));
        return { conflict: true, existing: json.existing || null };
    } else {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to create series: ${res.status} ${text}`);
    }
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

async function fetchUnscheduled() {
    const res = await fetch(`${API_BASE}/unscheduled`);
    if (!res.ok) throw new Error("Failed to fetch unscheduled");
    return res.json();
}
async function createUnscheduledOnServer(item) {
    const res = await fetch(`${API_BASE}/unscheduled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error("Failed to create unscheduled");
    return res.json();
}
async function deleteUnscheduledOnServer(id) {
    const res = await fetch(`${API_BASE}/unscheduled/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete unscheduled");
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

const pad2 = (n) => String(n).padStart(2, "0");
const minutesToHHMM = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${pad2(h)}:${pad2(m)}`;
};
const getDefaultStartEnd = () => {
    const now = new Date();
    const total = now.getHours() * 60 + now.getMinutes();
    const startMins = Math.ceil((total + 1) / 30) * 30;
    const endMins = startMins + 30;
    return { start: minutesToHHMM(startMins), end: minutesToHHMM(endMins) };
};

function normalizeRepeat(series) {
    if (series.repeatWeeks || series.repeatFreq) return series;
    const s = { ...series };
    if (!s.repeat) {
        s.repeatWeeks = [];
        s.repeatFreq = "none";
        return s;
    }
    const repeats = Array.isArray(s.repeat) ? s.repeat : [s.repeat];
    const weekOpts = repeats.filter((r) => /^week\d$/.test(r));
    const freq = repeats.find((r) =>
        ["daily", "monthly", "quarterly", "none", "weekly"].includes(r)
    );
    s.repeatWeeks = weekOpts;
    if (freq === "weekly") s.repeatFreq = "weekly";
    else if (freq === "none" || !freq) s.repeatFreq = "none";
    else s.repeatFreq = freq || "none";
    return s;
}

function occurrencesForSeriesInRange(seriesRaw, monthStart, monthEnd) {
    const series = normalizeRepeat(seriesRaw);
    const results = [];

    const start = parseISODate(series.startDate);
    const startY = start.getFullYear();
    const startM = start.getMonth();
    const startD = start.getDate();

    const repeatWeeks = Array.isArray(series.repeatWeeks) ? series.repeatWeeks : [];
    const repeatFreq = series.repeatFreq || "none";
    const exclusions = new Set(series.exclusions || []);
    const endDate = series.endDate ? parseISODate(series.endDate) : null;

    if (start > monthEnd && repeatFreq === "none" && repeatWeeks.length === 0) return results;

    for (let curr = new Date(monthStart); curr <= monthEnd; curr.setDate(curr.getDate() + 1)) {
        const y = curr.getFullYear();
        const m = curr.getMonth();
        const d = curr.getDate();
        const ds = toISODate(curr);

        if (endDate && curr > endDate) break;
        if (curr < start && repeatFreq === "none" && repeatWeeks.length === 0) continue;

        let match = false;
        const monthsDiff = (y - startY) * 12 + (m - startM);

        if (repeatWeeks.length && repeatWeeks.length > 0) {
            let freqOk = false;
            if (repeatFreq === "daily") {
                freqOk = monthsDiff >= 0;
            } else if (repeatFreq === "monthly") {
                freqOk = monthsDiff >= 0;
            } else if (repeatFreq === "quarterly") {
                freqOk = monthsDiff >= 0 && (monthsDiff % 3 === 0);
            } else if (repeatFreq === "none") {
                freqOk = false;
            } else {
                freqOk = monthsDiff >= 0;
            }

            if (freqOk && curr >= start) {
                if (weekdayIndex(curr) === weekdayIndex(start)) {
                    const wom = weekOfMonth(curr);
                    if (repeatWeeks.includes(`week${wom}`)) match = true;
                }
            }
        } else {
            if (repeatFreq === "none") {
                if (y === startY && m === startM && d === startD) match = true;
            } else if (repeatFreq === "daily") {
                if (curr >= start) match = true;
            } else if (repeatFreq === "monthly") {
                if ((d === startD) && monthsDiff >= 0) match = true;
            } else if (repeatFreq === "quarterly") {
                if ((d === startD) && monthsDiff >= 0 && (monthsDiff % 3 === 0)) match = true;
            } else {
                if ((d === startD) && (m === startM) && curr >= start) match = true;
            }
        }

        if (!match && ds === series.startDate) match = true;

        if (match && !exclusions.has(ds)) {
            results.push({
                date: ds,
                seriesId: series.id,
                name: series.name,
                startTime: series.startTime,
                endTime: series.endTime,
                repeat: { repeatWeeks: series.repeatWeeks || [], repeatFreq: series.repeatFreq || "none" },
            });
        }
    }

    return results;
}

const styles = {
    app: {
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial",
        padding: 12,
        height: "95vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
    },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
    yearGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(4, 1fr)",
        gap: 12,
        height: "100%",
        minHeight: 0,
    },
    monthBlock: {
        border: "1px solid #e6e6e6",
        borderRadius: 8,
        padding: 12,
        height: "100%",
        background: "#fff",
        boxShadow: "0 6px 18px rgba(0,0,0,0.03)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        boxSizing: "border-box",
        overflow: "hidden",
    },
    monthBlockDragOver: { background: "#eef6ff", borderColor: "#8fbdfc" },
    headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },

    monthName: { fontWeight: 800, fontSize: 18 },

    meta: { fontSize: 14, color: "maroon", fontWeight: 700 },

    eventsList: {
        marginTop: 8,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        overflowY: "auto",
        flex: 1,
        minHeight: 0,
        boxSizing: "border-box",
        paddingRight: 6,
        gridAutoRows: "min-content",
        alignContent: "start",
    },
    eventPreview: { borderRadius: 6, padding: "6px 8px", background: "#eef", whiteSpace: "normal", overflow: "hidden", textOverflow: "ellipsis", boxSizing: 'border-box', width: "100%", flex: '0 0 auto' },

    noEvents: { color: "maroon", fontSize: 14, fontFamily: "Georgia, 'Times New Roman', serif", opacity: 0.95 },
    sidePanel: {
        flex: "0 0 340px",
        width: 340,
        border: '1px solid #e6e6e6',
        borderRadius: 8,
        padding: 12,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxSizing: "border-box",
    },
    unscheduledList: {
        marginTop: 12,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flex: 1,
        minHeight: 0,
    },
    unscheduledItem: { padding: "2px 10px", border: "1px solid #ddd", borderRadius: 6, background: "#eef", cursor: "grab", display: "flex", justifyContent: "space-between", alignItems: "center" },
    smallBtn: { padding: "5px 5px", borderRadius: 6, border: "1px solid #aaa", cursor: "pointer" },
    smallBtnIco: { padding: "1px 1px", borderRadius: 6, border: "1px solid #aaa", cursor: "pointer" }, formInput: { width: "100%", padding: "2px 8px", boxSizing: "border-box", marginTop: 3, marginBottom: 10, fontSize: 16 },
    formInput: { width: "100%", padding: "2px 8px", boxSizing: "border-box", marginTop: 3, marginBottom: 10, fontSize: 16 },
    popupOverlay: { position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", zIndex: 9999, padding: "1rem" },
    popupModal: { position: "relative", minWidth: 320, maxWidth: "92%", maxHeight: "92%", overflow: "auto", background: "white", borderRadius: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.25)", padding: "1.25rem" },
};

const Popup = ({ children, onClose, title }) => {
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        document.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    }, [onClose]);

    return (
        <div style={styles.popupOverlay} onClick={onClose}>
            <div style={styles.popupModal} onClick={(e) => e.stopPropagation()}>
                <button aria-label="Close" onClick={onClose} style={{ position: "absolute", right: 8, top: 8, border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}>✕</button>
                {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
                <div>{children}</div>
            </div>
        </div>
    );
};


const ConfirmPopup = ({ title, message, onCancel, onConfirm, busy }) => {
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
        document.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    }, [onCancel]);

    return (
        <div style={styles.popupOverlay} onClick={onCancel}>
            <div style={styles.popupModal} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>{title || "Confirm"}</h3>
                <div style={{ marginBottom: 12 }}>{message}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button style={styles.smallBtn} onClick={onCancel} disabled={busy}>Cancel</button>
                    <button
                        style={{ ...styles.smallBtn, background: "#dc2626", color: "white", border: "none" }}
                        onClick={() => { onConfirm?.(); }}
                        disabled={busy}
                    >
                        {busy ? "Deleting…" : "Yes"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SchedulePopup = ({ unscheduled, year, monthIndex, onCancel, onScheduled, recentNames = [] }) => {
    const defaultDateStr = formatDDMMYYYY(new Date(year, monthIndex, 1));
    const defaultTimes = getDefaultStartEnd();

    const [name, setName] = useState(unscheduled?.name || "");
    const [date, setDate] = useState(defaultDateStr);
    const [startTime, setStartTime] = useState(defaultTimes.start);
    const [endTime, setEndTime] = useState(defaultTimes.end);
    const [repeatWeeks, setRepeatWeeks] = useState([]);
    const [repeatFreq, setRepeatFreq] = useState('none');


    const submitRef = useRef(null);

    useEffect(() => {
        setName(unscheduled?.name || "");
        setDate(defaultDateStr);
        setRepeatWeeks([]);
        setRepeatFreq('none');
        const dt = getDefaultStartEnd();
        setStartTime(dt.start);
        setEndTime(dt.end);

    }, [unscheduled, defaultDateStr]);

    function toggleWeek(val) {
        setRepeatWeeks(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
    }

    async function submit() {
        try {

            const parsed = parseDDMMYYYY(date);
            if (!parsed || isNaN(parsed.getTime())) {
                alert("Please provide a valid date in dd/mm/yyyy format.");
                return;
            }
            const isoDate = toISODate(parsed);

            const existing = await fetchEvents();
            const dup = (existing || []).find(s =>
                s.name === (name || "Untitled") &&
                s.startDate === isoDate &&
                ((s.startTime || "") === (startTime || "")) &&
                ((s.endTime || "") === (endTime || ""))
            );

            if (dup) {
                alert("An event with the same name, date and time already exists on the calendar.");
                onCancel();
                return;
            }

            const series = {
                id: `ts-${Date.now()}`,
                name: (name || "Untitled"),
                startDate: isoDate,
                startTime: startTime || null,
                endTime: endTime || null,
                repeatWeeks: repeatWeeks,
                repeatFreq: repeatFreq || 'none',
                exclusions: [],
                endDate: null,
                createdAt: new Date().toISOString(),
            };

            const resp = await createSeriesOnServer(series);

            if (resp && resp.conflict) {
                const existingServer = resp.existing;
                if (existingServer) {
                    const existingTimesSame =
                        ((existingServer.startTime || "") === (series.startTime || "")) &&
                        ((existingServer.endTime || "") === (series.endTime || ""));
                    if (!existingTimesSame) {
                        alert(
                            "The server rejected this create request even though the times differ. " +
                            "This likely means the backend enforces uniqueness on (name + date). " +
                            "To allow multiple events with the same name on the same date, update the server's uniqueness rule to include time (or remove the uniqueness check)."
                        );
                    } else {
                        alert("An identical event already exists on the server.");
                    }
                } else {
                    alert("Server reports a conflicting event (409). Server may be enforcing name+date uniqueness.");
                }
                onCancel();
                return;
            } else if (resp && resp.created) {
                onScheduled(resp.series, { removedOnly: false });
                return;
            } else {
                throw new Error("Unexpected create result");
            }
        } catch (err) {
            alert("Failed to schedule: " + (err.message || String(err)));
        }
    }


    useEffect(() => {
        submitRef.current = submit;
    }, [submit, name, date, startTime, endTime, repeatWeeks, repeatFreq]);


    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();

                if (submitRef.current) submitRef.current();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    return (
        <Popup onClose={onCancel} title={`Schedule "${unscheduled?.name || ''}" — ${["JAN", "FEB", "MAR", "APR", "MAY", "JUNE", "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"][monthIndex]} ${year}`}>
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'grid', gap: 8 }}>
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
                        type="date"
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
                    <div style={{ marginBottom: 6 }}>Repeat:</div>
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

                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" style={styles.smallBtn}>Schedule</button>
                    <button type="button" style={styles.smallBtn} onClick={onCancel}>Cancel</button>
                </div>
            </form>
        </Popup>
    );
};

export default function Home({ yearOverride } = {}) {
    const today = new Date();
    const initialYear = yearOverride || today.getFullYear();
    const [selectedYear, setSelectedYear] = useState(initialYear);
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUNE", "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"];

    const [seriesArray, setSeriesArray] = useState([]);
    const [loadingErr, setLoadingErr] = useState(null);
    const [loading, setLoading] = useState(true);

    const [unscheduled, setUnscheduled] = useState([]);
    const [unschedName, setUnschedName] = useState("");
    const [dragOverMonth, setDragOverMonth] = useState(null);
    const [scheduling, setScheduling] = useState(null);


    const [confirmDeleteUnscheduledId, setConfirmDeleteUnscheduledId] = useState(null);
    const [confirmDeleteUnscheduledName, setConfirmDeleteUnscheduledName] = useState(null);
    const [confirmBusy, setConfirmBusy] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoading(true);
            try {
                const arr = await fetchEvents();
                if (mounted) setSeriesArray(arr || []);
            } catch (err) {
                if (mounted) setLoadingErr(err.message || String(err));
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const arr = await fetchUnscheduled();
                if (mounted) setUnscheduled(Array.isArray(arr) ? arr : []);
            } catch (err) {
                console.warn("failed to load unscheduled from server:", err);
                if (mounted) setUnscheduled([]);
            }
        })();
        return () => { mounted = false; };
    }, []);

    const monthOccs = useMemo(() => {
        const out = Array.from({ length: 12 }, () => []);
        for (let m = 0; m < 12; m++) {
            const ms = new Date(selectedYear, m, 1);
            const me = new Date(selectedYear, m + 1, 0);
            const bucket = [];
            for (const s of seriesArray) {
                try {
                    const occs = occurrencesForSeriesInRange(s, ms, me);
                    for (const o of occs) bucket.push(o);
                } catch (e) {

                }
            }
            bucket.sort((a, b) => ((a.startTime || "") > (b.startTime || "")) ? 1 : -1);
            out[m] = bucket;
        }
        return out;
    }, [seriesArray, selectedYear]);

    function goToMonth(monthIndex) {
        const path = `/month?year=${selectedYear}&month=${monthIndex}`;
        window.location.href = path;
    }

    const recentNames = useMemo(() => {
        const seriesNames = Array.isArray(seriesArray) ? seriesArray
            .slice()
            .sort((a, b) => {
                const ta = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const tb = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return tb - ta;
            })
            .map(s => s && s.name).filter(Boolean) : [];
        const uns = Array.isArray(unscheduled) ? unscheduled.map(u => u.name).filter(Boolean) : [];
        const combined = [...uns, ...seriesNames];
        const uniq = [];
        for (const n of combined) {
            if (!uniq.includes(n)) uniq.push(n);
            if (uniq.length >= 20) break;
        }
        return uniq;
    }, [seriesArray, unscheduled]);


    async function createUnscheduled() {
        const name = (unschedName || "Untitled").trim();
        if (!name) return;
        const item = { id: `us-${Date.now()}`, name, createdAt: new Date().toISOString() };
        try {
            await createUnscheduledOnServer(item);
            const arr = await fetchUnscheduled();
            setUnscheduled(Array.isArray(arr) ? arr : []);
            setUnschedName("");
        } catch (err) {
            alert("Failed to save unscheduled: " + (err.message || String(err)));
        }
    }
    async function deleteUnscheduled(id) {
        try {
            await deleteUnscheduledOnServer(id);
            const arr = await fetchUnscheduled();
            setUnscheduled(Array.isArray(arr) ? arr : []);
        } catch (err) {
            alert("Failed to delete unscheduled: " + (err.message || String(err)));
        }
    }

    function onUnscheduledDragStart(e, item) {
        e.dataTransfer.setData("application/json", JSON.stringify({ type: "unscheduled", item }));
        e.dataTransfer.effectAllowed = "move";
    }
    function onMonthDragOver(e, mIndex) { e.preventDefault(); setDragOverMonth(mIndex); }
    function onMonthDragLeave() { setDragOverMonth(null); }
    function onMonthDrop(e, mIndex) {
        e.preventDefault();
        setDragOverMonth(null);
        try {
            const payload = e.dataTransfer.getData("application/json");
            if (!payload) return;
            const parsed = JSON.parse(payload);
            if (parsed.type === "unscheduled" && parsed.item) {
                setScheduling({ unscheduledItem: parsed.item, monthIndex: mIndex });
            }
        } catch (err) {
            console.error("drop parse error", err);
        }
    }

    async function handleScheduled(series, opts = {}) {
        setScheduling(null);
        try {
            const arr = await fetchEvents();
            setSeriesArray(arr || []);
        } catch (err) {
            setLoadingErr(err.message || String(err));
        }
    }


    function requestDeleteUnscheduled(item) {
        setConfirmDeleteUnscheduledId(item.id);
        setConfirmDeleteUnscheduledName(item.name);
    }


    async function confirmDeleteUnscheduled() {
        if (!confirmDeleteUnscheduledId) return;
        setConfirmBusy(true);
        try {

            await deleteUnscheduledOnServer(confirmDeleteUnscheduledId);


            const toDelete = (seriesArray || []).filter(s => s && s.name === confirmDeleteUnscheduledName).map(s => s.id);

            if (toDelete.length > 0) {

                await Promise.allSettled(toDelete.map(id => deleteSeriesOnServer(id).catch(err => {
                    console.warn("failed to delete series", id, err);
                })));
            }


            const [freshUnscheduled, freshSeries] = await Promise.all([fetchUnscheduled(), fetchEvents()]);
            setUnscheduled(Array.isArray(freshUnscheduled) ? freshUnscheduled : []);
            setSeriesArray(Array.isArray(freshSeries) ? freshSeries : []);
        } catch (err) {
            alert("Failed to delete: " + (err.message || String(err)));
        } finally {
            setConfirmBusy(false);
            setConfirmDeleteUnscheduledId(null);
            setConfirmDeleteUnscheduledName(null);
        }
    }

    return (
        <div style={styles.app}>
            <div style={styles.header}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <h2 style={{ margin: 0 }}>Year —</h2>
                    <input
                        type="number"
                        value={selectedYear}
                        onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isNaN(v)) setSelectedYear(v);
                        }}
                        style={{ width: 110, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
                    />
                </div>

                <div />
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 12, flex: 1, minHeight: 0, overflow: "hidden" }}>
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    {loading ? <div style={{ color: "#666" }}>Loading events…</div> : (
                        <div style={styles.yearGrid}>
                            {months.map((mName, idx) => {
                                const occs = monthOccs[idx] || [];
                                const isDragOver = dragOverMonth === idx;
                                return (
                                    <div
                                        key={mName}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => goToMonth(idx)}
                                        onKeyDown={(e) => { if (e.key === "Enter") goToMonth(idx); }}
                                        onDragOver={(e) => onMonthDragOver(e, idx)}
                                        onDragEnter={(e) => onMonthDragOver(e, idx)}
                                        onDragLeave={() => onMonthDragLeave()}
                                        onDrop={(e) => onMonthDrop(e, idx)}
                                        style={{ ...styles.monthBlock, ...(isDragOver ? styles.monthBlockDragOver : {}) }}
                                    >
                                        <div style={styles.headerRow}>
                                            <div style={styles.monthName}>{mName}</div>
                                            <div style={styles.meta}>{occs.length} events</div>
                                        </div>

                                        <div style={{ marginTop: 8, flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                                            {occs.length === 0 ? (
                                                <div style={styles.noEvents}>No events</div>
                                            ) : (

                                                <div style={styles.eventsList}>
                                                    {occs.map((o, i) => (
                                                        <div key={`${o.seriesId}-${o.date}-${i}`} style={styles.eventPreview}>
                                                            <div style={{ fontWeight: 600 }}>{o.name}</div>
                                                            <div style={{ fontSize: 12, color: "#444" }}>{o.date}{o.startTime ? ` • ${o.startTime}` : ""}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div style={styles.sidePanel}>
                    <h3 style={{ marginTop: 0 }}>Create event (unscheduled)</h3>

                    <label>
                        Event name
                        <input
                            style={styles.formInput}
                            value={unschedName}
                            onChange={(e) => setUnschedName(e.target.value)}
                            placeholder="Event name"
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createUnscheduled(); } }}
                            list="unsched-suggestions"
                        />
                        <datalist id="unsched-suggestions">
                            {recentNames.map((n, idx) => <option key={idx} value={n} />)}
                        </datalist>
                    </label>

                    <div style={{ display: "flex", gap: 8 }}>
                        <button style={styles.smallBtn} onClick={createUnscheduled}>Create</button>
                        <button style={styles.smallBtn} onClick={() => { setUnschedName(""); }}>Clear</button>
                    </div>

                    <div style={{ marginTop: 12, fontSize: 13, color: "#666" }}>
                        Drag any unscheduled event onto a month to open the schedule menu.
                    </div>
                    <div style={styles.unscheduledList}>
                        {unscheduled.length === 0 ? (
                            <div style={styles.noEvents}>No unscheduled events</div>
                        ) : unscheduled.map(u => (
                            <div
                                key={u.id}
                                draggable
                                onDragStart={(e) => onUnscheduledDragStart(e, u)}
                                style={styles.unscheduledItem}
                            >
                                <div style={{ fontSize: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{u.name}</div>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button
                                        style={styles.smallBtnIco}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            requestDeleteUnscheduled(u);
                                        }}
                                    >
                                        <TiDeleteOutline  size={20}/>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {scheduling && scheduling.unscheduledItem && (
                <SchedulePopup
                    unscheduled={scheduling.unscheduledItem}
                    year={selectedYear}
                    monthIndex={scheduling.monthIndex}
                    onCancel={() => setScheduling(null)}
                    onScheduled={(series, opts) => handleScheduled(series, opts)}
                    recentNames={recentNames}
                />
            )}

            {confirmDeleteUnscheduledId && (
                <ConfirmPopup
                    title="Delete series?"
                    message="Are you sure? This will delete the full series across the calendar."
                    onCancel={() => { if (!confirmBusy) { setConfirmDeleteUnscheduledId(null); setConfirmDeleteUnscheduledName(null); } }}
                    onConfirm={confirmDeleteUnscheduled}
                    busy={confirmBusy}
                />
            )}

            {loadingErr && <div style={{ color: "red", marginTop: 12 }}>{loadingErr}</div>}
        </div>
    );
}
