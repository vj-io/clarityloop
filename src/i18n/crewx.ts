import type { Dict } from "@/lib/i18n";

// Crew channel, crew tasks, roll-call board (keys start with "x.").
export const crewx: Dict = {
  // ---- seen is not understood
  "x.seen.notYet": { en: "{worker} has not opened this yet", hi: "{worker} ने इसे अभी नहीं खोला", ta: "{worker} இதை இன்னும் திறக்கவில்லை" },
  "x.seen.at": { en: "Seen {time}", hi: "{time} पर देखा", ta: "{time} மணிக்குப் பார்த்தார்" },
  "x.seen.notUnderstood": { en: "not yet understood", hi: "अभी समझा नहीं गया", ta: "இன்னும் புரிந்துகொள்ளவில்லை" },
  "x.seen.understood": { en: "Understood", hi: "समझ लिया", ta: "புரிந்துகொண்டார்" },
  // ---- crew channel
  "x.crewChat": { en: "Crew chat", hi: "टीम चैट", ta: "குழு அரட்டை" },
  "x.openCrewChat": { en: "Open crew chat", hi: "टीम चैट खोलें", ta: "குழு அரட்டையைத் திற" },
  "x.crewChatHint": { en: "Say it once. Everyone reads it in their own language.", hi: "एक बार कहिए। सब अपनी भाषा में पढ़ेंगे।", ta: "ஒருமுறை சொல்லுங்கள். எல்லோரும் தங்கள் மொழியில் படிப்பார்கள்." },
  "x.people": { en: "{n} people", hi: "{n} लोग", ta: "{n} பேர்" },
  "x.eachOwnLang": { en: "each reads in their own language", hi: "हर कोई अपनी भाषा में पढ़ता है", ta: "ஒவ்வொருவரும் தங்கள் மொழியில் படிக்கிறார்கள்" },
  "x.empty.title": { en: "Say it once to the whole crew", hi: "पूरी टीम से एक बार कहिए", ta: "முழுக் குழுவிடமும் ஒருமுறை சொல்லுங்கள்" },
  "x.empty.body": { en: "Everyone reads your message in their own language.", hi: "हर कोई आपका मैसेज अपनी भाषा में पढ़ेगा।", ta: "எல்லோரும் உங்கள் செய்தியைத் தங்கள் மொழியில் படிப்பார்கள்." },
  "x.empty.task": { en: "For work that must be done right, tap Task for the crew below.", hi: "जो काम सही होना ज़रूरी है, उसके लिए नीचे “टीम को काम” दबाएँ।", ta: "சரியாகச் செய்ய வேண்டிய வேலைக்கு, கீழே “குழுவுக்கு வேலை” அழுத்தவும்." },
  "x.crewTask": { en: "Task for the crew", hi: "टीम को काम", ta: "குழுவுக்கு வேலை" },

  // ---- crew task form
  "x.form.title": { en: "Send a task to the whole crew", hi: "पूरी टीम को काम भेजें", ta: "முழுக் குழுவுக்கும் வேலை அனுப்பு" },
  "x.form.to": { en: "To all {n} workers. Each one gets it in their own language and says it back on their own.", hi: "सभी {n} कामगारों को। हर कोई इसे अपनी भाषा में पाएगा और अलग से दोहराएगा।", ta: "{n} தொழிலாளர்களுக்கும். ஒவ்வொருவரும் தங்கள் மொழியில் பெற்று, தனியாகத் திருப்பிச் சொல்வார்கள்." },
  "x.form.safety": { en: "Safety briefing", hi: "सुरक्षा ब्रीफ़िंग", ta: "பாதுகாப்பு விளக்கம்" },
  "x.form.safetyHint": { en: "Marks it as a safety point. Each worker still says it back.", hi: "इसे सुरक्षा की बात के रूप में दिखाता है। हर कामगार फिर भी दोहराएगा।", ta: "இதைப் பாதுகாப்புக் குறிப்பாகக் காட்டும். ஒவ்வொருவரும் திருப்பிச் சொல்ல வேண்டும்." },
  "x.form.previewIn": { en: "Preview in", hi: "इस भाषा में देखें", ta: "இந்த மொழியில் பார்" },
  "x.form.noWorkers": { en: "No workers in the crew yet. Share the crew code first.", hi: "टीम में अभी कोई कामगार नहीं। पहले टीम कोड भेजें।", ta: "குழுவில் இன்னும் தொழிலாளர் இல்லை. முதலில் குழு குறியீட்டைப் பகிருங்கள்." },
  "x.form.send": { en: "Send to the whole crew", hi: "पूरी टीम को भेजें", ta: "முழுக் குழுவுக்கும் அனுப்பு" },

  // ---- roll-call board
  "x.board.label": { en: "Roll call · whole crew", hi: "हाज़िरी · पूरी टीम", ta: "வருகை · முழுக் குழு" },
  "x.board.from": { en: "From {sup} · each worker says it back in their own language", hi: "{sup} से · हर कामगार अपनी भाषा में दोहराता है", ta: "{sup} இடமிருந்து · ஒவ்வொருவரும் தங்கள் மொழியில் திருப்பிச் சொல்கிறார்கள்" },
  "x.board.progress": { en: "{n} of {total} understood", hi: "{total} में से {n} ने समझा", ta: "{total} பேரில் {n} பேர் புரிந்தனர்" },
  "x.board.allDone": { en: "Everyone understood", hi: "सबने समझ लिया", ta: "எல்லோரும் புரிந்துகொண்டனர்" },
  "x.board.notYet": { en: "Not yet", hi: "अभी नहीं", ta: "இன்னும் இல்லை" },
  "x.board.you": { en: "You", hi: "आप", ta: "நீங்கள்" },
  "x.board.open": { en: "Open chat", hi: "चैट खोलें", ta: "அரட்டையைத் திற" },
  "x.board.sayBack": { en: "Say it back in your chat", hi: "अपनी चैट में दोहराएँ", ta: "உங்கள் அரட்டையில் திருப்பிச் சொல்லுங்கள்" },
  "x.board.private": { en: "Only you and {sup} see your details. Others see only “understood” or “not yet”.", hi: "आपकी जानकारी सिर्फ़ आप और {sup} देखते हैं। बाकी सिर्फ़ “समझ लिया” या “अभी नहीं” देखते हैं।", ta: "உங்கள் விவரங்களை நீங்களும் {sup} மட்டுமே பார்க்கிறீர்கள். மற்றவர்கள் “புரிந்தது” அல்லது “இன்னும் இல்லை” மட்டும் பார்ப்பார்கள்." },
  "x.board.noWorkers": { en: "No workers got this task.", hi: "यह काम किसी कामगार को नहीं गया।", ta: "இந்த வேலை எந்தத் தொழிலாளருக்கும் போகவில்லை." },
  "x.board.loading": { en: "Loading roll call", hi: "हाज़िरी आ रही है", ta: "வருகை வருகிறது" },

  // ---- task card / task list
  "x.task.crewBadge": { en: "Crew task", hi: "टीम का काम", ta: "குழு வேலை" },
  "x.tasks.group": { en: "Crew task · {n} of {total} understood", hi: "टीम का काम · {total} में से {n} ने समझा", ta: "குழு வேலை · {total} பேரில் {n} பேர் புரிந்தனர்" },
  "x.tasks.show": { en: "Show each worker", hi: "हर कामगार देखें", ta: "ஒவ்வொருவரையும் பார்" },

  // ---- judge mode (third account)
  "x.judge.openLakshmi": { en: "Open as Lakshmi: worker, Tamil", hi: "लक्ष्मी के रूप में खोलें: कामगार, तमिल", ta: "லட்சுமியாகத் திற: தொழிலாளி, தமிழ்" },
  "x.judge.enteringL": { en: "Opening Lakshmi's account", hi: "लक्ष्मी का अकाउंट खुल रहा है", ta: "லட்சுமியின் கணக்கைத் திறக்கிறது" },
  "x.judge.l4": { en: "A third account, Lakshmi, a worker who reads Tamil, is in the same crew for the crew chat.", hi: "तीसरा अकाउंट, लक्ष्मी, तमिल पढ़ने वाली कामगार, उसी टीम में है, टीम चैट के लिए।", ta: "மூன்றாவது கணக்கு, தமிழ் படிக்கும் தொழிலாளி லட்சுமி, குழு அரட்டைக்காக அதே குழுவில் இருக்கிறார்." },
  "x.judge.st5": { en: "Say it to the whole crew", hi: "पूरी टीम से कहें", ta: "முழுக் குழுவிடமும் சொல்லுங்கள்" },
  "x.judge.st5b": { en: "Ravi: open crew chat → Send a task to the whole crew → Murugan and Lakshmi each say it back → watch the roll-call board.", hi: "रवि: टीम चैट खोलें → पूरी टीम को काम भेजें → मुरुगन और लक्ष्मी अलग-अलग दोहराएँ → हाज़िरी बोर्ड देखें।", ta: "ரவி: குழு அரட்டையைத் திற → முழுக் குழுவுக்கும் வேலை அனுப்பு → முருகனும் லட்சுமியும் தனித்தனியே திருப்பிச் சொல்வார்கள் → வருகைப் பலகையைப் பாருங்கள்." },
  "x.judge.who_lakshmi": { en: "Lakshmi types", hi: "लक्ष्मी लिखती है", ta: "லட்சுமி எழுதுவது" },
};
