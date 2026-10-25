// The interface's own words in seven languages: nav, personas, buttons and section titles, so menus
// never flicker. Everything else on screen (insights, answers, stories) is translated live by the
// Narrator and checked by the Verifier (see src/state/i18n.tsx). Feature names that appear in alerts
// and agent text (Ghost Run) keep the spelling the agents use.

import type { Lang } from '../agents/format';

type Row = [en: string, zh: string, ms: string, ta: string, hi: string, es: string, pt: string];

const ROWS: Row[] = [
  // navigation
  ['Current Affairs', '联赛现状', 'Hal Ehwal Semasa', 'நடப்பு நிலவரம்', 'ताज़ा हालात', 'Actualidad', 'Atualidade'],
  ['The Swing', '比赛摆幅', 'Ayunan Perlawanan', 'ஆட்ட மாற்றம்', 'मैच का पलटाव', 'El Vaivén', 'A Virada'],
  ['Ghost Run', '幽灵推演', 'Ghost Run', 'கோஸ்ட் ரன்', 'घोस्ट रन', 'Ghost Run', 'Ghost Run'],
  ['Ripple', '涟漪效应', 'Riak', 'அலைவிளைவு', 'लहर असर', 'Efecto dominó', 'Efeito dominó'],
  ['Multiverse', '平行宇宙', 'Alam Selari', 'இணை உலகங்கள்', 'समानांतर दुनिया', 'Multiverso', 'Multiverso'],
  ['Settle It', '一锤定音', 'Putuskan', 'தீர்ப்பு', 'फ़ैसला करें', 'Zánjalo', 'Tira-teima'],
  ['My Dugout', '我的教练席', 'Dugout Saya', 'என் டக்அவுட்', 'मेरा डगआउट', 'Mi banquillo', 'Meu banco'],
  ['Language', '语言', 'Bahasa', 'மொழி', 'भाषा', 'Idioma', 'Idioma'],
  // how you watch
  ['Watch as', '观看身份', 'Tonton sebagai', 'பார்வை', 'किस नज़र से', 'Ver como', 'Ver como'],
  ['Casual', '休闲球迷', 'Santai', 'சாதாரண ரசிகர்', 'आम दर्शक', 'Casual', 'Casual'],
  ['Analyst', '分析师', 'Penganalisis', 'பகுப்பாய்வாளர்', 'विश्लेषक', 'Analista', 'Analista'],
  ['{club} fan', '{club}球迷', 'Peminat {club}', '{club} ரசிகர்', '{club} फ़ैन', 'Hincha del {club}', 'Torcedor do {club}'],
  // match state and controls
  ['Full time', '全场结束', 'Tamat', 'ஆட்டம் முடிந்தது', 'फ़ुल टाइम', 'Final', 'Fim de jogo'],
  ['Kick-off', '开球', 'Sepak mula', 'ஆட்டத் தொடக்கம்', 'किक-ऑफ़', 'Inicio', 'Início'],
  ['Play', '播放', 'Main', 'இயக்கு', 'चलाएँ', 'Reproducir', 'Reproduzir'],
  ['Pause', '暂停', 'Jeda', 'இடைநிறுத்து', 'रोकें', 'Pausa', 'Pausar'],
  ['Skip to full time', '跳到全场结束', 'Langkau ke tamat', 'முடிவுக்குச் செல்', 'फ़ुल टाइम पर जाएँ', 'Saltar al final', 'Pular para o fim'],
  ['Broadcast overlay', '转播叠加画面', 'Grafik siaran', 'ஒளிபரப்பு வரைகலை', 'ब्रॉडकास्ट ओवरले', 'Grafismo de emisión', 'Grafismo da transmissão'],
  ['For broadcasters', '供转播方使用', 'Untuk penyiar', 'ஒளிபரப்பாளர்களுக்கு', 'ब्रॉडकास्टर्स के लिए', 'Para televisiones', 'Para emissoras'],
  ['Download the graphics feed', '下载图形数据流', 'Muat turun suapan grafik', 'வரைகலை தரவைப் பதிவிறக்கு', 'ग्राफ़िक्स फ़ीड डाउनलोड करें', 'Descargar el feed gráfico', 'Baixar o feed de grafismo'],
  // common actions
  ['Ask', '提问', 'Tanya', 'கேள்', 'पूछें', 'Preguntar', 'Perguntar'],
  ['Close', '关闭', 'Tutup', 'மூடு', 'बंद करें', 'Cerrar', 'Fechar'],
  ['Loading…', '加载中…', 'Memuatkan…', 'ஏற்றுகிறது…', 'लोड हो रहा है…', 'Cargando…', 'Carregando…'],
  ['Copy recap', '复制战报', 'Salin ringkasan', 'சுருக்கத்தை நகலெடு', 'सारांश कॉपी करें', 'Copiar crónica', 'Copiar resumo'],
  ['Copy the story', '复制报道', 'Salin cerita', 'கதையை நகலெடு', 'कहानी कॉपी करें', 'Copiar la historia', 'Copiar a história'],
  ['Copy script', '复制稿件', 'Salin skrip', 'உரையை நகலெடு', 'स्क्रिप्ट कॉपी करें', 'Copiar guion', 'Copiar roteiro'],
  ['Play it out', '模拟一遍', 'Mainkan', 'விளையாடிப் பார்', 'खेलकर देखें', 'Simularlo', 'Simular'],
  ['See the squad →', '查看阵容 →', 'Lihat skuad →', 'அணியைப் பார் →', 'स्क्वॉड देखें →', 'Ver la plantilla →', 'Ver o elenco →'],
  ['Chances and games left', '概率与剩余赛程', 'Peluang dan perlawanan berbaki', 'வாய்ப்புகளும் மீதமுள்ள ஆட்டங்களும்', 'संभावनाएँ और बचे मैच', 'Probabilidades y partidos restantes', 'Chances e jogos restantes'],
  ['More stats: creating, defending, keeping', '更多数据：组织、防守、门将', 'Lebih statistik: mencipta, bertahan, menjaga gol', 'மேலும் புள்ளிவிவரம்: உருவாக்கம், தற்காப்பு, கோல்காப்பு', 'और आँकड़े: मौके बनाना, बचाव, गोलकीपिंग', 'Más estadísticas: creación, defensa, porteros', 'Mais estatísticas: criação, defesa, goleiros'],
  ['Fewer stats', '收起数据', 'Kurangkan statistik', 'குறைவான புள்ளிவிவரம்', 'कम आँकड़े', 'Menos estadísticas', 'Menos estatísticas'],
  // section titles
  ['The table', '积分榜', 'Jadual', 'புள்ளிப் பட்டியல்', 'तालिका', 'La clasificación', 'A tabela'],
  ['Players', '球员', 'Pemain', 'வீரர்கள்', 'खिलाड़ी', 'Jugadores', 'Jogadores'],
  ['Chance', '概率', 'Peluang', 'வாய்ப்பு', 'संभावना', 'Probabilidad', 'Chance'],
  ['Riding their luck', '运气加成', 'Bernasib baik', 'அதிர்ஷ்டத்தில் சவாரி', 'किस्मत का साथ', 'Con la suerte de cara', 'Contando com a sorte'],
  ['What stands out', '亮点', 'Yang menonjol', 'கவனிக்கத்தக்கவை', 'क्या खास है', 'Lo que destaca', 'O que se destaca'],
  ['The squad', '阵容', 'Skuad', 'அணி', 'स्क्वॉड', 'La plantilla', 'O elenco'],
  ['Games left', '剩余赛程', 'Perlawanan berbaki', 'மீதமுள்ள ஆட்டங்கள்', 'बचे हुए मैच', 'Partidos restantes', 'Jogos restantes'],
  ['The recap', '赛后战报', 'Ringkasan', 'சுருக்கம்', 'मैच सारांश', 'La crónica', 'O resumo'],
  ['Impact Reel', '影响集锦', 'Detik Penentu', 'தாக்கத் தொகுப்பு', 'असर वाले पल', 'Momentos clave', 'Lances decisivos'],
  ['The Ripple', '涟漪效应', 'Riak', 'அலைவிளைவு', 'लहर असर', 'El efecto dominó', 'O efeito dominó'],
  ['How it works', '运作方式', 'Cara ia berfungsi', 'இது எப்படி இயங்குகிறது', 'यह कैसे काम करता है', 'Cómo funciona', 'Como funciona'],
  ['Routes there', '实现路径', 'Laluan ke sana', 'அங்கு செல்லும் வழிகள்', 'वहाँ तक के रास्ते', 'Caminos para lograrlo', 'Caminhos até lá'],
  ['On points alone', '仅看积分', 'Dari segi mata sahaja', 'புள்ளிகளில் மட்டும்', 'सिर्फ़ अंकों से', 'Solo en puntos', 'Só em pontos'],
  ['Your alerts this matchweek', '本轮你的提醒', 'Amaran anda minggu ini', 'இந்த வார உங்கள் எச்சரிக்கைகள்', 'इस हफ़्ते आपके अलर्ट', 'Tus alertas de la jornada', 'Seus alertas da rodada'],
  ['Saved Universes', '已保存的宇宙', 'Alam yang disimpan', 'சேமித்த உலகங்கள்', 'सहेजे गए यूनिवर्स', 'Universos guardados', 'Universos salvos'],
  ['Your Universes', '你的宇宙', 'Alam anda', 'உங்கள் உலகங்கள்', 'आपके यूनिवर्स', 'Tus universos', 'Seus universos'],
  // Multiverse and Ask
  ['What if…', '如果……', 'Bagaimana jika…', 'ஒருவேளை…', 'अगर…', '¿Y si…?', 'E se…'],
  ['What would it take?', '需要什么才能做到？', 'Apa yang diperlukan?', 'என்ன தேவைப்படும்?', 'क्या करना होगा?', '¿Qué haría falta?', 'O que seria preciso?'],
  ['Find the smallest change', '寻找最小改变', 'Cari perubahan terkecil', 'மிகச் சிறிய மாற்றத்தைக் கண்டுபிடி', 'सबसे छोटा बदलाव खोजें', 'Buscar el cambio mínimo', 'Achar a menor mudança'],
  ['Settle it', '一锤定音', 'Putuskan', 'தீர்ப்பு சொல்', 'फ़ैसला करें', 'Zanjarlo', 'Tirar a teima'],
  ['Ask anything about the matchweek or the league…', '问问本轮比赛或联赛的任何问题……', 'Tanya apa sahaja tentang minggu perlawanan atau liga…', 'இந்த வார ஆட்டங்கள் அல்லது லீக் பற்றி எதையும் கேளுங்கள்…', 'इस हफ़्ते के मैचों या लीग के बारे में कुछ भी पूछें…', 'Pregunta lo que quieras sobre la jornada o la liga…', 'Pergunte qualquer coisa sobre a rodada ou a liga…'],
  ['Handed over by the router', '由路由智能体转交', 'Diserahkan oleh penghala', 'வழிநடத்தி ஒப்படைத்தது', 'राउटर ने सौंपा', 'Derivado por el enrutador', 'Encaminhado pelo roteador'],
  ['How the agents worked it out', '智能体如何得出结论', 'Cara ejen menyelesaikannya', 'முகவர்கள் எப்படிக் கண்டறிந்தனர்', 'एजेंटों ने कैसे निकाला', 'Cómo lo resolvieron los agentes', 'Como os agentes chegaram lá'],
  ['Watch The Swing live', '观看比赛摆幅直播', 'Tonton Ayunan Perlawanan secara langsung', 'ஆட்ட மாற்றத்தை நேரலையில் பார்', 'मैच का पलटाव लाइव देखें', 'Ver El Vaivén en directo', 'Ver A Virada ao vivo'],
  ['Same match.', '同一场比赛。', 'Perlawanan sama.', 'அதே ஆட்டம்.', 'वही मैच।', 'El mismo partido.', 'O mesmo jogo.'],
  ['Different ending.', '不同的结局。', 'Pengakhiran berbeza.', 'வேறு முடிவு.', 'अलग अंत।', 'Otro final.', 'Outro final.'],
  // short labels used across screens
  ['Live', '直播', 'Langsung', 'நேரலை', 'लाइव', 'En directo', 'Ao vivo'],
  ['Win', '胜', 'Menang', 'வெற்றி', 'जीत', 'Victoria', 'Vitória'],
  ['Draw', '平局', 'Seri', 'சமநிலை', 'ड्रॉ', 'Empate', 'Empate'],
  ['Match', '比赛', 'Perlawanan', 'ஆட்டம்', 'मैच', 'Partido', 'Jogo'],
  ['Club', '球队', 'Kelab', 'கிளப்', 'क्लब', 'Club', 'Clube'],
  ['Form', '近况', 'Prestasi', 'ஃபார்ம்', 'फ़ॉर्म', 'Racha', 'Forma'],
  ['Pts', '积分', 'Mata', 'புள்ளி', 'अंक', 'Pts', 'Pts'],
  ['Manager', '主教练', 'Pengurus', 'மேலாளர்', 'मैनेजर', 'Entrenador', 'Treinador'],
  ['Age', '年龄', 'Umur', 'வயது', 'उम्र', 'Edad', 'Idade'],
  ['Role', '角色', 'Peranan', 'பாத்திரம்', 'भूमिका', 'Rol', 'Função'],
  ['Apps', '出场', 'Penampilan', 'ஆட்டங்கள்', 'मैच', 'PJ', 'Jogos'],
  ['Cards', '牌', 'Kad', 'அட்டைகள்', 'कार्ड', 'Tarjetas', 'Cartões'],
  ['Clean sheets', '零封', 'Tanpa bolos', 'கிளீன் ஷீட்கள்', 'क्लीन शीट', 'Porterías a cero', 'Jogos sem sofrer gols'],
  ['Points deserved', '应得积分', 'Mata yang layak', 'தகுதியான புள்ளிகள்', 'हक़ के अंक', 'Puntos merecidos', 'Pontos merecidos'],
  ['Won-drawn-lost', '胜-平-负', 'Menang-seri-kalah', 'வெற்றி-சமன்-தோல்வி', 'जीते-ड्रॉ-हारे', 'Ganados-empatados-perdidos', 'Vitórias-empates-derrotas'],
  ['Try', '试试', 'Cuba', 'முயற்சி', 'आज़माएँ', 'Prueba', 'Experimente'],
  ['Target', '目标', 'Matlamat', 'இலக்கு', 'लक्ष्य', 'Objetivo', 'Objetivo'],
  ['Goal', '进球', 'Gol', 'கோல்', 'गोल', 'Gol', 'Gol'],
  ['What happened', '实际发生', 'Apa yang berlaku', 'நடந்தது', 'क्या हुआ', 'Lo que pasó', 'O que aconteceu'],
  ['Stopped', '被阻止', 'Dihentikan', 'தடுக்கப்பட்டது', 'रोका गया', 'Cortada', 'Interrompida'],
  ['Why it matters', '为何重要', 'Kenapa ia penting', 'ஏன் முக்கியம்', 'यह क्यों अहम है', 'Por qué importa', 'Por que importa'],
  ['Match feed', '比赛动态', 'Suapan perlawanan', 'ஆட்ட நிகழ்வுகள்', 'मैच फ़ीड', 'Minuto a minuto', 'Lance a lance'],
  ['Live stats', '实时数据', 'Statistik langsung', 'நேரலை புள்ளிவிவரம்', 'लाइव आँकड़े', 'Estadísticas en directo', 'Estatísticas ao vivo'],
  ['Result', '结果', 'Keputusan', 'முடிவு', 'नतीजा', 'Resultado', 'Resultado'],
  ['Before', '之前', 'Sebelum', 'முன்', 'पहले', 'Antes', 'Antes'],
  ['After', '之后', 'Selepas', 'பின்', 'बाद', 'Después', 'Depois'],
  ['Change', '变化', 'Perubahan', 'மாற்றம்', 'बदलाव', 'Cambio', 'Mudança'],
  ['Skip to content', '跳到正文', 'Langkau ke kandungan', 'உள்ளடக்கத்துக்குச் செல்', 'सामग्री पर जाएँ', 'Saltar al contenido', 'Pular para o conteúdo'],
  ['Done', '完成', 'Selesai', 'முடிந்தது', 'हो गया', 'Hecho', 'Pronto'],
  ['Off', '关闭', 'Tutup', 'அணை', 'बंद', 'No', 'Desligado'],
  ['Open', '打开', 'Buka', 'திற', 'खोलें', 'Abrir', 'Abrir'],
  // leaderboards and races
  ['Goals', '进球', 'Gol', 'கோல்கள்', 'गोल', 'Goles', 'Gols'],
  ['Assists', '助攻', 'Bantuan', 'உதவிகள்', 'असिस्ट', 'Asistencias', 'Assistências'],
  ['Beating xG', '超出预期进球', 'Melebihi xG', 'xG-ஐ மிஞ்சுதல்', 'xG से ज़्यादा', 'Por encima del xG', 'Acima do xG'],
  ['Yellow cards', '黄牌', 'Kad kuning', 'மஞ்சள் அட்டைகள்', 'पीले कार्ड', 'Tarjetas amarillas', 'Cartões amarelos'],
  ['Red cards', '红牌', 'Kad merah', 'சிவப்பு அட்டைகள்', 'लाल कार्ड', 'Tarjetas rojas', 'Cartões vermelhos'],
  ['Creating', '组织进攻', 'Mencipta', 'உருவாக்கம்', 'मौके बनाना', 'Creación', 'Criação'],
  ['Defending', '防守', 'Bertahan', 'தற்காப்பு', 'बचाव', 'Defensa', 'Defesa'],
  ['Keeping', '门将', 'Penjaga gol', 'கோல்காப்பு', 'गोलकीपिंग', 'Porteros', 'Goleiros'],
  ['Win the league', '夺冠', 'Juara liga', 'லீக் பட்டம்', 'लीग जीतना', 'Ganar la liga', 'Ser campeão'],
  ['Top four', '前四', 'Empat teratas', 'முதல் நான்கு', 'टॉप फ़ोर', 'Top cuatro', 'Top quatro'],
  ['Stay up', '保级', 'Kekal di liga', 'லீக்கில் நீடிப்பு', 'लीग में बने रहना', 'Salvación', 'Permanência'],
  ['Relegated', '降级', 'Tersingkir', 'தரமிறக்கம்', 'रेलिगेशन', 'Descenso', 'Rebaixamento'],
  ['Title', '冠军', 'Juara', 'பட்டம்', 'ख़िताब', 'Título', 'Título'],
  ['Relegation', '降级', 'Penyingkiran', 'தரமிறக்கம்', 'रेलिगेशन', 'Descenso', 'Rebaixamento']
];

const LANG_ORDER: Lang[] = ['en', 'zh', 'ms', 'ta', 'hi', 'es', 'pt'];

/** dictionary[lang][english] = translation */
export const DICT: Record<Lang, Map<string, string>> = Object.fromEntries(
  LANG_ORDER.map((l, i) => [l, new Map(ROWS.map((r) => [r[0], r[i]]))])
) as Record<Lang, Map<string, string>>;
