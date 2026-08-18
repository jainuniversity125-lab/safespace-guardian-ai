// Client-safe: a small, hand-labelled multilingual Indian starter set used to
// demonstrate the evaluation lab. Real projects upload a full CSV/JSONL instead.
export const SAMPLE_DATASET_NAME = "Indian multilingual starter set";

export const SAMPLE_DATASET_CSV = `text,language,script_mix,expected_bullying,expected_category,expected_severity
"Nin face nodakke agalla, class ge banbeda innu",kn,romanized,true,insult_humiliation,low
"Yaake bandhe ninu illi? Nin hage ivattu ellaru nintha nagta iddare, hogu saayi",kn,romanized,true,self_harm_encouragement,critical
"Namma team gedidhu! Super aitu guys",kn,romanized,false,non_bullying,safe
"ಇವಳ ಫೋಟೋ ಎಲ್ಲರಿಗೂ ಕಳಿಸ್ತೀನಿ, ನೋಡ್ಕೊ ಏನಾಗುತ್ತೆ ಅಂತ",kn,native,true,threat_intimidation,high
"ಚೆನ್ನಾಗಿ ಬರೆದಿದ್ದೀಯ, ಮುಂದುವರೆಸು",kn,native,false,non_bullying,safe
"Tere jaise loser ko koi job nahi dega, group chhod de",hi,romanized,true,insult_humiliation,medium
"Uska number 98xxxxx hai, sab log call karo aur pareshaan karo",hi,romanized,true,doxxing,high
"Bhai kya mast khela aaj, proud of you",hi,romanized,false,non_bullying,safe
"तेरी फोटो एडिट करके सबको भेज दूंगा, तब पता चलेगा",hi,native,true,sexual_exploitation,high
"कल मिलते हैं, नोट्स ले आना",hi,native,false,non_bullying,safe
"Ivnu full waste guru, adre nam duddu vaapas kodu antha helu",kn,code_mixed,false,ambiguous_needs_review,low
"Nin appa amma ge helthini nin bagge, ninna school inda hakstini nodu",kn,code_mixed,true,threat_intimidation,medium
"Yeh ladki hamesha attention chahti hai, sab ignore karo isko",hi,code_mixed,true,exclusion_pile_on,medium
"Someone said 'tu marja' to her in the group, please report it",en,code_mixed,false,non_bullying,safe
"Kitna bhi try karle, tu kabhi normal nahi lagegi",hi,romanized,true,insult_humiliation,medium
"You are so dumb, nobody in class likes you",en,native,true,insult_humiliation,medium
"Great presentation today, well done",en,native,false,non_bullying,safe
"I will find your house and make you regret this",en,native,true,threat_intimidation,high
"Nange nin mele kopa illa, sorry kelidini",kn,romanized,false,non_bullying,safe
"Sab log iske photos pe gande comment karo, maza aayega",hi,romanized,true,sexual_harassment,high
"Avanu gay antha ellarigu heli nagona",kn,code_mixed,true,hate_identity_abuse,high
"Stop messaging me, I have asked ten times already",en,native,false,non_bullying,safe
"Roz message karta rahunga jab tak reply nahi karti",hi,romanized,true,stalking_repeated_contact,medium
"Ninna marks nodi nange hemme aytu",kn,romanized,false,non_bullying,safe
`;
