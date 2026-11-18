import type { Dict } from "@/lib/i18n";

// Voice (speak instead of type, listen instead of read), read receipts, unread, mentions (keys start with "v.").
export const voice: Dict = {
  // ---- microphone
  "v.mic.start": { en: "Speak instead of typing", hi: "टाइप करने की जगह बोलिए", ta: "தட்டச்சு செய்யாமல் பேசுங்கள்" },
  "v.mic.stop": { en: "Stop listening", hi: "सुनना बंद करें", ta: "கேட்பதை நிறுத்து" },
  "v.mic.listening": { en: "Listening… tap to stop", hi: "सुन रहे हैं… रोकने के लिए दबाएँ", ta: "கேட்கிறது… நிறுத்தத் தட்டுங்கள்" },
  "v.mic.check": { en: "Read the words before you send.", hi: "भेजने से पहले शब्द पढ़ लीजिए।", ta: "அனுப்பும் முன் சொற்களைப் படியுங்கள்." },
  "v.mic.denied": { en: "The microphone is blocked. You can type instead.", hi: "माइक बंद है। आप टाइप कर सकते हैं।", ta: "மைக் தடுக்கப்பட்டுள்ளது. நீங்கள் தட்டச்சு செய்யலாம்." },
  "v.mic.privacy": {
    en: "Your voice is turned into text by your browser. ClarityLoop keeps only the text.",
    hi: "आपकी आवाज़ को आपका ब्राउज़र लिखकर देता है। ClarityLoop सिर्फ़ लिखा हुआ रखता है।",
    ta: "உங்கள் குரலை உங்கள் உலாவி எழுத்தாக மாற்றுகிறது. ClarityLoop எழுத்தை மட்டுமே வைத்திருக்கும்.",
  },
  // ---- read aloud
  "v.listen": { en: "Listen", hi: "सुनिए", ta: "கேளுங்கள்" },
  "v.listenStop": { en: "Stop reading aloud", hi: "पढ़कर सुनाना बंद करें", ta: "வாசிப்பதை நிறுத்து" },
  // ---- read receipts
  "v.read": { en: "Read {time}", hi: "पढ़ लिया {time}", ta: "படித்தார் {time}" },
  "v.readBy": { en: "Read by {n} of {total}", hi: "{total} में से {n} ने पढ़ा", ta: "{total} பேரில் {n} பேர் படித்தனர்" },
  // ---- unread and mentions
  // counts every new item in the chat: messages and cards
  "v.unread": { en: "{n} updates", hi: "{n} नई बातें", ta: "{n} புதுப்பிப்புகள்" },
  "v.board.confirm": { en: "Confirm", hi: "पक्का करें", ta: "உறுதிசெய்" },
  "v.board.confirmed": { en: "You confirmed · waiting for {worker} to confirm", hi: "आपने पक्का किया · {worker} के पक्का करने का इंतज़ार", ta: "நீங்கள் உறுதிசெய்தீர்கள் · {worker} உறுதிசெய்யக் காத்திருக்கிறோம்" },
  "v.board.confirmFail": { en: "Could not confirm. Open the chat and try there.", hi: "पक्का नहीं हो पाया। चैट खोलकर वहाँ कोशिश करें।", ta: "உறுதிசெய்ய முடியவில்லை. அரட்டையைத் திறந்து அங்கே முயலுங்கள்." },
  "v.atYou": { en: "@ you", hi: "@ आप", ta: "@ நீங்கள்" },
  "v.mention": { en: "Mention someone", hi: "किसी का नाम जोड़ें", ta: "ஒருவரைக் குறிப்பிடுங்கள்" },
};
