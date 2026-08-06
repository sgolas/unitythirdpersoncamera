/**
 * Translation languages + a small offline travel phrasebook.
 *
 * The phrasebook lets the most useful phrases translate even with no signal
 * (e.g. on a plane or a foreign SIM with no data). Anything not covered falls
 * back to cached online translations, and only then needs the internet.
 */

export interface Lang { code: string; name: string; flag: string; bcp47: string }

/** Languages offered in the translator. English first (the usual "you speak"),
 *  then alphabetical by name. All of these are supported both online and by the
 *  on-device offline models. */
export const VOICE_LANGS: Lang[] = [
  { code: 'en', name: 'English',     flag: '🇬🇧', bcp47: 'en-US' },
  { code: 'ar', name: 'Arabic',      flag: '🇸🇦', bcp47: 'ar-SA' },
  { code: 'bg', name: 'Bulgarian',   flag: '🇧🇬', bcp47: 'bg-BG' },
  { code: 'zh', name: 'Chinese',     flag: '🇨🇳', bcp47: 'zh-CN' },
  { code: 'hr', name: 'Croatian',    flag: '🇭🇷', bcp47: 'hr-HR' },
  { code: 'cs', name: 'Czech',       flag: '🇨🇿', bcp47: 'cs-CZ' },
  { code: 'da', name: 'Danish',      flag: '🇩🇰', bcp47: 'da-DK' },
  { code: 'nl', name: 'Dutch',       flag: '🇳🇱', bcp47: 'nl-NL' },
  { code: 'et', name: 'Estonian',    flag: '🇪🇪', bcp47: 'et-EE' },
  { code: 'fi', name: 'Finnish',     flag: '🇫🇮', bcp47: 'fi-FI' },
  { code: 'fr', name: 'French',      flag: '🇫🇷', bcp47: 'fr-FR' },
  { code: 'de', name: 'German',      flag: '🇩🇪', bcp47: 'de-DE' },
  { code: 'el', name: 'Greek',       flag: '🇬🇷', bcp47: 'el-GR' },
  { code: 'hi', name: 'Hindi',       flag: '🇮🇳', bcp47: 'hi-IN' },
  { code: 'hu', name: 'Hungarian',   flag: '🇭🇺', bcp47: 'hu-HU' },
  { code: 'it', name: 'Italian',     flag: '🇮🇹', bcp47: 'it-IT' },
  { code: 'ja', name: 'Japanese',    flag: '🇯🇵', bcp47: 'ja-JP' },
  { code: 'ko', name: 'Korean',      flag: '🇰🇷', bcp47: 'ko-KR' },
  { code: 'lv', name: 'Latvian',     flag: '🇱🇻', bcp47: 'lv-LV' },
  { code: 'lt', name: 'Lithuanian',  flag: '🇱🇹', bcp47: 'lt-LT' },
  { code: 'mt', name: 'Maltese',     flag: '🇲🇹', bcp47: 'mt-MT' },
  { code: 'pl', name: 'Polish',      flag: '🇵🇱', bcp47: 'pl-PL' },
  { code: 'pt', name: 'Portuguese',  flag: '🇵🇹', bcp47: 'pt-PT' },
  { code: 'ro', name: 'Romanian',    flag: '🇷🇴', bcp47: 'ro-RO' },
  { code: 'ru', name: 'Russian',     flag: '🇷🇺', bcp47: 'ru-RU' },
  { code: 'sk', name: 'Slovak',      flag: '🇸🇰', bcp47: 'sk-SK' },
  { code: 'sl', name: 'Slovenian',   flag: '🇸🇮', bcp47: 'sl-SI' },
  { code: 'es', name: 'Spanish',     flag: '🇪🇸', bcp47: 'es-ES' },
  { code: 'th', name: 'Thai',        flag: '🇹🇭', bcp47: 'th-TH' },
  { code: 'tr', name: 'Turkish',     flag: '🇹🇷', bcp47: 'tr-TR' },
  { code: 'vi', name: 'Vietnamese',  flag: '🇻🇳', bcp47: 'vi-VN' },
];

export const langByCode = (code: string) => VOICE_LANGS.find(l => l.code === code);

/** Canonical English keys for the offline phrasebook. */
export const PHRASE_KEYS = [
  'Hello', 'Thank you', 'Please', 'Yes', 'No', 'Excuse me', 'Sorry',
  'Do you speak English?', 'I don’t understand', 'How much is this?',
  'Where is the toilet?', 'Where is the train station?', 'Help!',
  'I would like a coffee', 'The bill, please', 'One beer, please',
  'Where is a hospital?', 'Call the police', 'I have a reservation',
  'Can you help me?', 'Good morning', 'Good evening', 'Goodbye',
] as const;

/** Offline translations for the phrase keys above. Keyed by language code. */
export const PHRASEBOOK: Record<string, Record<string, string>> = {
  fr: {
    'Hello': 'Bonjour', 'Thank you': 'Merci', 'Please': 'S’il vous plaît', 'Yes': 'Oui', 'No': 'Non',
    'Excuse me': 'Excusez-moi', 'Sorry': 'Pardon', 'Do you speak English?': 'Parlez-vous anglais ?',
    'I don’t understand': 'Je ne comprends pas', 'How much is this?': 'Combien ça coûte ?',
    'Where is the toilet?': 'Où sont les toilettes ?', 'Where is the train station?': 'Où est la gare ?',
    'Help!': 'Au secours !', 'I would like a coffee': 'Je voudrais un café', 'The bill, please': 'L’addition, s’il vous plaît',
    'One beer, please': 'Une bière, s’il vous plaît', 'Where is a hospital?': 'Où est un hôpital ?',
    'Call the police': 'Appelez la police', 'I have a reservation': 'J’ai une réservation',
    'Can you help me?': 'Pouvez-vous m’aider ?', 'Good morning': 'Bonjour', 'Good evening': 'Bonsoir', 'Goodbye': 'Au revoir',
  },
  es: {
    'Hello': 'Hola', 'Thank you': 'Gracias', 'Please': 'Por favor', 'Yes': 'Sí', 'No': 'No',
    'Excuse me': 'Perdón', 'Sorry': 'Lo siento', 'Do you speak English?': '¿Habla inglés?',
    'I don’t understand': 'No entiendo', 'How much is this?': '¿Cuánto cuesta?',
    'Where is the toilet?': '¿Dónde está el baño?', 'Where is the train station?': '¿Dónde está la estación de tren?',
    'Help!': '¡Ayuda!', 'I would like a coffee': 'Quiero un café', 'The bill, please': 'La cuenta, por favor',
    'One beer, please': 'Una cerveza, por favor', 'Where is a hospital?': '¿Dónde hay un hospital?',
    'Call the police': 'Llame a la policía', 'I have a reservation': 'Tengo una reserva',
    'Can you help me?': '¿Puede ayudarme?', 'Good morning': 'Buenos días', 'Good evening': 'Buenas noches', 'Goodbye': 'Adiós',
  },
  it: {
    'Hello': 'Ciao', 'Thank you': 'Grazie', 'Please': 'Per favore', 'Yes': 'Sì', 'No': 'No',
    'Excuse me': 'Mi scusi', 'Sorry': 'Mi dispiace', 'Do you speak English?': 'Parla inglese?',
    'I don’t understand': 'Non capisco', 'How much is this?': 'Quanto costa?',
    'Where is the toilet?': 'Dov’è il bagno?', 'Where is the train station?': 'Dov’è la stazione?',
    'Help!': 'Aiuto!', 'I would like a coffee': 'Vorrei un caffè', 'The bill, please': 'Il conto, per favore',
    'One beer, please': 'Una birra, per favore', 'Where is a hospital?': 'Dov’è un ospedale?',
    'Call the police': 'Chiami la polizia', 'I have a reservation': 'Ho una prenotazione',
    'Can you help me?': 'Può aiutarmi?', 'Good morning': 'Buongiorno', 'Good evening': 'Buonasera', 'Goodbye': 'Arrivederci',
  },
  de: {
    'Hello': 'Hallo', 'Thank you': 'Danke', 'Please': 'Bitte', 'Yes': 'Ja', 'No': 'Nein',
    'Excuse me': 'Entschuldigung', 'Sorry': 'Es tut mir leid', 'Do you speak English?': 'Sprechen Sie Englisch?',
    'I don’t understand': 'Ich verstehe nicht', 'How much is this?': 'Wie viel kostet das?',
    'Where is the toilet?': 'Wo ist die Toilette?', 'Where is the train station?': 'Wo ist der Bahnhof?',
    'Help!': 'Hilfe!', 'I would like a coffee': 'Ich möchte einen Kaffee', 'The bill, please': 'Die Rechnung, bitte',
    'One beer, please': 'Ein Bier, bitte', 'Where is a hospital?': 'Wo ist ein Krankenhaus?',
    'Call the police': 'Rufen Sie die Polizei', 'I have a reservation': 'Ich habe eine Reservierung',
    'Can you help me?': 'Können Sie mir helfen?', 'Good morning': 'Guten Morgen', 'Good evening': 'Guten Abend', 'Goodbye': 'Auf Wiedersehen',
  },
  pl: {
    'Hello': 'Cześć', 'Thank you': 'Dziękuję', 'Please': 'Proszę', 'Yes': 'Tak', 'No': 'Nie',
    'Excuse me': 'Przepraszam', 'Sorry': 'Przepraszam', 'Do you speak English?': 'Czy mówisz po angielsku?',
    'I don’t understand': 'Nie rozumiem', 'How much is this?': 'Ile to kosztuje?',
    'Where is the toilet?': 'Gdzie jest toaleta?', 'Where is the train station?': 'Gdzie jest dworzec kolejowy?',
    'Help!': 'Pomocy!', 'I would like a coffee': 'Poproszę kawę', 'The bill, please': 'Rachunek proszę',
    'One beer, please': 'Jedno piwo proszę', 'Where is a hospital?': 'Gdzie jest szpital?',
    'Call the police': 'Zadzwoń na policję', 'I have a reservation': 'Mam rezerwację',
    'Can you help me?': 'Czy możesz mi pomóc?', 'Good morning': 'Dzień dobry', 'Good evening': 'Dobry wieczór', 'Goodbye': 'Do widzenia',
  },
  pt: {
    'Hello': 'Olá', 'Thank you': 'Obrigado', 'Please': 'Por favor', 'Yes': 'Sim', 'No': 'Não',
    'Excuse me': 'Com licença', 'Sorry': 'Desculpe', 'Do you speak English?': 'Fala inglês?',
    'I don’t understand': 'Não entendo', 'How much is this?': 'Quanto custa?',
    'Where is the toilet?': 'Onde é a casa de banho?', 'Where is the train station?': 'Onde é a estação de comboio?',
    'Help!': 'Socorro!', 'I would like a coffee': 'Queria um café', 'The bill, please': 'A conta, por favor',
    'One beer, please': 'Uma cerveja, por favor', 'Where is a hospital?': 'Onde há um hospital?',
    'Call the police': 'Chame a polícia', 'I have a reservation': 'Tenho uma reserva',
    'Can you help me?': 'Pode ajudar-me?', 'Good morning': 'Bom dia', 'Good evening': 'Boa noite', 'Goodbye': 'Adeus',
  },
};

/** Look up an offline translation (case/space-insensitive). Null if unknown. */
export function offlinePhrase(text: string, to: string): string | null {
  const book = PHRASEBOOK[to];
  if (!book) return null;
  const norm = text.trim().toLowerCase().replace(/[.!?¿¡]+$/, '');
  for (const [k, v] of Object.entries(book)) {
    if (k.toLowerCase().replace(/[.!?¿¡]+$/, '') === norm) return v;
  }
  return null;
}
