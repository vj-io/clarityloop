import type { Dict } from "@/lib/i18n";

// Site words (crew glossary), suggestions after "Translation looks wrong", "Make this a task", reminders (keys start with "g.").
export const terms: Dict = {
  // ---- site words on /crew
  "g.title": { en: "Site words", hi: "साइट के शब्द", ta: "தளச் சொற்கள்" },
  "g.hint": {
    en: "Your site's own words for materials, machines and places. Every translation in your crew uses them.",
    hi: "सामान, मशीन और जगहों के लिए आपकी साइट के अपने शब्द। आपकी टीम का हर अनुवाद इन्हें इस्तेमाल करता है।",
    ta: "பொருட்கள், இயந்திரங்கள், இடங்களுக்கு உங்கள் தளத்தின் சொந்தச் சொற்கள். உங்கள் குழுவின் ஒவ்வொரு மொழிபெயர்ப்பும் இவற்றைப் பயன்படுத்தும்.",
  },
  "g.empty": {
    en: "No site words yet. Add one, or wait for words your crew flags.",
    hi: "अभी कोई साइट शब्द नहीं। एक जोड़िए, या टीम के बताए शब्दों का इंतज़ार कीजिए।",
    ta: "இன்னும் தளச் சொற்கள் இல்லை. ஒன்றைச் சேருங்கள், அல்லது குழு குறிக்கும் சொற்களுக்குக் காத்திருங்கள்.",
  },
  "g.word": { en: "Word, as people here write it", hi: "शब्द, जैसे यहाँ लोग लिखते हैं", ta: "சொல், இங்கே மக்கள் எழுதுவது போல" },
  "g.wordPh": { en: "e.g. sariya, JCB, shuttering", hi: "जैसे सरिया, JCB, शटरिंग", ta: "எ.கா. கம்பி, JCB, ஷட்டரிங்" },
  "g.meaning": { en: "What it means (in {lang})", hi: "इसका मतलब ({lang} में)", ta: "இதன் பொருள் ({lang} இல்)" },
  "g.meaningHint": {
    en: "We write it in the crew's other languages for you. You can fix them after.",
    hi: "टीम की बाकी भाषाओं में हम लिख देंगे। बाद में आप ठीक कर सकते हैं।",
    ta: "குழுவின் மற்ற மொழிகளில் நாங்கள் எழுதுவோம். பிறகு நீங்கள் திருத்தலாம்.",
  },
  "g.meaningIn": { en: "Meaning in {lang}", hi: "{lang} में मतलब", ta: "{lang} இல் பொருள்" },
  "g.add": { en: "Add word", hi: "शब्द जोड़ें", ta: "சொல்லைச் சேர்" },
  "g.adding": { en: "Adding…", hi: "जोड़ रहे हैं…", ta: "சேர்க்கிறது…" },
  "g.edit": { en: "Edit", hi: "बदलें", ta: "திருத்து" },
  "g.save": { en: "Save", hi: "सेव करें", ta: "சேமி" },
  "g.cancel": { en: "Cancel", hi: "रद्द करें", ta: "ரத்து" },
  "g.remove": { en: "Remove", hi: "हटाएँ", ta: "நீக்கு" },
  "g.dup": { en: "This word is already a site word.", hi: "यह शब्द पहले से साइट शब्दों में है।", ta: "இந்தச் சொல் ஏற்கனவே தளச் சொல்." },
  "g.fromFlag": { en: "From a flag", hi: "शिकायत से", ta: "குறிப்பிலிருந்து" },

  // ---- suggestions (supervisor)
  "g.sugTitle": { en: "Words your crew flagged", hi: "टीम के बताए शब्द", ta: "குழு குறித்த சொற்கள்" },
  "g.sugHint": {
    en: "Someone tapped “Translation looks wrong” and named the word. Add it so it is translated right from now on.",
    hi: "किसी ने “अनुवाद गलत लगता है” दबाकर शब्द बताया। इसे जोड़िए ताकि आगे से सही अनुवाद हो।",
    ta: "யாரோ “மொழிபெயர்ப்பு தவறாகத் தெரிகிறது” என்று தட்டி சொல்லைச் சொன்னார். இனி சரியாக மொழிபெயர்க்க இதைச் சேருங்கள்.",
  },
  "g.sugBy": { en: "{name} · in {lang}", hi: "{name} · {lang} में", ta: "{name} · {lang} இல்" },
  "g.sugMeans": { en: "It means: {meaning}", hi: "मतलब: {meaning}", ta: "பொருள்: {meaning}" },
  "g.sugAdd": { en: "Add to site words", hi: "साइट शब्दों में जोड़ें", ta: "தளச் சொற்களில் சேர்" },
  "g.sugDismiss": { en: "Dismiss", hi: "हटा दें", ta: "தள்ளுபடி" },
  "g.prefilled": {
    en: "Filled from {name}'s suggestion. Check it, then add.",
    hi: "{name} के सुझाव से भरा है। जाँचिए, फिर जोड़िए।",
    ta: "{name} இன் பரிந்துரையிலிருந்து நிரப்பப்பட்டது. சரிபார்த்து, பிறகு சேருங்கள்.",
  },

  // ---- read-only list (chat header)
  "g.link": { en: "Site words", hi: "साइट के शब्द", ta: "தளச் சொற்கள்" },
  "g.listTitle": { en: "This site's own words", hi: "इस साइट के अपने शब्द", ta: "இந்தத் தளத்தின் சொந்தச் சொற்கள்" },
  "g.readOnly": { en: "Your supervisor keeps this list.", hi: "यह सूची आपके सुपरवाइज़र रखते हैं।", ta: "இந்தப் பட்டியலை உங்கள் மேற்பார்வையாளர் வைத்திருக்கிறார்." },
  "g.loadFailed": { en: "Couldn't load the words. Tap to try again.", hi: "शब्द नहीं खुले। फिर दबाएँ।", ta: "சொற்களை ஏற்ற முடியவில்லை. மீண்டும் தட்டுங்கள்." },

  // ---- after "Translation looks wrong"
  "g.which": { en: "Which word was wrong?", hi: "कौन सा शब्द गलत था?", ta: "எந்தச் சொல் தவறு?" },
  "g.whichPh": { en: "the word as written", hi: "जैसा लिखा है वैसा शब्द", ta: "எழுதியபடி சொல்" },
  "g.means": { en: "It means… (optional)", hi: "इसका मतलब… (चाहें तो)", ta: "இதன் பொருள்… (விருப்பம்)" },
  "g.send": { en: "Send", hi: "भेजें", ta: "அனுப்பு" },
  "g.skip": { en: "Not now", hi: "अभी नहीं", ta: "இப்போது இல்லை" },
  "g.sent": { en: "Thanks — your supervisor will see it.", hi: "धन्यवाद — आपके सुपरवाइज़र इसे देखेंगे।", ta: "நன்றி — உங்கள் மேற்பார்வையாளர் இதைப் பார்ப்பார்." },
  "g.sendFailed": { en: "Couldn't send — try again", hi: "नहीं भेज पाए — फिर कोशिश करें", ta: "அனுப்ப முடியவில்லை — மீண்டும் முயலுங்கள்" },

  // ---- "Make this a task"
  "g.makeTask": { en: "Make this a task", hi: "इसे काम बनाएँ", ta: "இதை வேலையாக்கு" },
  "g.making": { en: "Reading the message…", hi: "संदेश पढ़ रहे हैं…", ta: "செய்தியைப் படிக்கிறது…" },
  "g.draftFilled": {
    en: "Filled from your message. Check every marked field before you send.",
    hi: "आपके संदेश से भरा है। भेजने से पहले हर निशान वाली जगह जाँचिए।",
    ta: "உங்கள் செய்தியிலிருந்து நிரப்பப்பட்டது. அனுப்பும் முன் குறித்த ஒவ்வொன்றையும் சரிபாருங்கள்.",
  },
  "g.draftNone": {
    en: "We couldn't read task details from that message. Fill in the form as usual.",
    hi: "उस संदेश से काम की बातें नहीं पढ़ पाए। फ़ॉर्म हमेशा की तरह भरिए।",
    ta: "அந்தச் செய்தியிலிருந்து வேலை விவரங்களைப் படிக்க முடியவில்லை. படிவத்தை வழக்கம் போல நிரப்புங்கள்.",
  },
  "g.draftFrom": { en: "From the message:", hi: "संदेश से:", ta: "செய்தியிலிருந்து:" },
  "g.filledMark": { en: "Filled from your message — check it", hi: "आपके संदेश से भरा — जाँच लें", ta: "உங்கள் செய்தியிலிருந்து — சரிபாருங்கள்" },
  "g.timeAssumed": { en: "No am/pm said: read as afternoon — check it", hi: "सुबह/शाम नहीं लिखा: दोपहर माना — जाँच लें", ta: "காலை/மாலை சொல்லவில்லை: மதியம் என எடுத்தோம் — சரிபாருங்கள்" },

  // ---- reminders
  "g.remind": { en: "Remind {worker}", hi: "{worker} को याद दिलाएँ", ta: "{worker} க்கு நினைவூட்டு" },
  "g.reminding": { en: "Reminding…", hi: "याद दिला रहे हैं…", ta: "நினைவூட்டுகிறது…" },
  "g.reminded": { en: "Reminded {time}", hi: "{time} पर याद दिलाया", ta: "{time} க்கு நினைவூட்டப்பட்டது" },
  "g.remindAgain": { en: "You can remind again at {time}.", hi: "{time} के बाद फिर याद दिला सकते हैं।", ta: "{time} க்குப் பிறகு மீண்டும் நினைவூட்டலாம்." },
  "g.nudge.worker": { en: "{sup} is waiting for you to say this task back", hi: "{sup} इंतज़ार कर रहे हैं कि आप यह काम अपने शब्दों में बताएँ", ta: "இந்த வேலையை நீங்கள் திருப்பிச் சொல்ல {sup} காத்திருக்கிறார்" },
  "g.nudge.go": { en: "Say it back now", hi: "अभी बताइए", ta: "இப்போது சொல்லுங்கள்" },
  "g.nudge.sup": { en: "You reminded {worker} · {time}", hi: "आपने {worker} को याद दिलाया · {time}", ta: "நீங்கள் {worker} க்கு நினைவூட்டினீர்கள் · {time}" },
  "g.nudge.past": { en: "Reminder from {sup} · {time}", hi: "{sup} की याद · {time}", ta: "{sup} இன் நினைவூட்டல் · {time}" },

  // ---- /tasks
  "g.overdue": { en: "Overdue to say back", hi: "बताना बाकी, देर हो गई", ta: "திருப்பிச் சொல்லத் தாமதம்" },
  "g.overdueHint": {
    en: "Waiting more than 15 minutes, or past their time, and not said back yet.",
    hi: "15 मिनट से ज़्यादा या समय निकल गया, और अभी तक बताया नहीं।",
    ta: "15 நிமிடத்துக்கு மேல் அல்லது நேரம் கடந்தும், இன்னும் திருப்பிச் சொல்லவில்லை.",
  },
  "g.overdueEmpty": { en: "Nothing overdue. Every waiting task is recent.", hi: "कुछ भी देर से नहीं। हर बाकी काम नया है।", ta: "தாமதம் எதுவும் இல்லை. காத்திருக்கும் எல்லா வேலைகளும் புதியவை." },
  "g.waitingFor": { en: "waiting {min} min", hi: "{min} मिनट से इंतज़ार", ta: "{min} நிமிடமாகக் காத்திருப்பு" },
  "g.pastDue": { en: "past {time}", hi: "{time} निकल गया", ta: "{time} கடந்தது" },
};
