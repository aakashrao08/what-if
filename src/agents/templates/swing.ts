// Narrator templates for The Swing (mock mode). Each template is a small function of the facts
// the Analyst assembled, so the same moment reads differently for a casual viewer, either set
// of fans, or an analyst, in seven languages. In live mode a model writes these instead and
// the Verifier checks both the same way.

import type { MomentKind } from '../../data/types';
import type { MomentFacts } from '../analyst';
import { favour, nameIn, num, signed, type Lang, type Persona } from '../format';
import { forSide } from '../analyst';
import { familyText, familyWhatIf } from './family';

type T = (f: MomentFacts, n: (s: string) => string, lang: Lang) => string;
type Bank = Partial<Record<Lang, Record<Persona, T>>>;

const B5 = (f: MomentFacts) => (f.b5Xg < 0.05
  ? `Harbour haven’t allowed an open-play shot since switching to a back five at ${f.b5Minute}′.`
  : `Since switching to a back five at ${f.b5Minute}′, Harbour have conceded ${f.b5Xg} xG from open play.`);

export const SWING: Partial<Record<MomentKind, Bank>> = {
  goal_long_range: {
    en: {
      casual: (f) => `A long-range curler that usually doesn’t go in. Northbridge go from ${favour(f.hB)} to ${favour(f.hA)} with one kick.`,
      home: (f) => `${f.player}, what a hit. Only about 1 in ${f.oneIn} of those go in, and it puts us ${f.hA >= 70 ? 'firmly in charge' : 'in front'}: ${f.hA}% to win.`,
      away: (f) => `Unlucky. That’s a shot that goes in about once in ${f.oneIn} tries, and it drops our chances to ${f.aA}%. Plenty of time left.`,
      analyst: (f) => `Shot xG ${f.xg} from ${f.distance}m, ball speed ${f.shotKmh} km/h. Win probability ${f.hB}% → ${f.hA}% (exact). The scoreline is now ahead of the chance quality.`
    },
    zh: {
      casual: (f) => `一记通常不会进的远射弧线球。就这一脚，北桥从${favour(f.hB, 'zh')}变成了${favour(f.hA, 'zh')}。`,
      home: (f, n) => `${n(f.player)}这脚太漂亮了！这种球大约${f.oneIn}次才进1次，我们一下子掌握主动：胜率${f.hA}%。`,
      away: (f) => `运气不好。这种球大约${f.oneIn}次才进1次，我们的胜率跌到${f.aA}%。时间还很多。`,
      analyst: (f) => `射门xG ${f.xg}，距离${f.distance}米，球速${f.shotKmh}公里/小时。胜率${f.hB}% → ${f.hA}%（精确计算）。比分领先于实际机会质量。`
    },
    ms: {
      casual: (f) => `Rembatan melengkung dari jarak jauh yang jarang menjadi gol. Dengan satu sepakan, Northbridge berubah daripada ${favour(f.hB, 'ms')} kepada ${favour(f.hA, 'ms')}.`,
      home: (f) => `${f.player}, rembatan yang hebat! Hanya kira-kira 1 daripada ${f.oneIn} percubaan begini menjadi gol, dan kini peluang kita menang ${f.hA}%.`,
      away: (f) => `Malang. Rembatan begitu hanya masuk kira-kira sekali dalam ${f.oneIn} percubaan, dan peluang kita jatuh ke ${f.aA}%. Masih banyak masa.`,
      analyst: (f) => `xG rembatan ${f.xg} dari ${f.distance}m, kelajuan bola ${f.shotKmh} km/j. Kebarangkalian menang ${f.hB}% → ${f.hA}% (tepat). Keputusan kini mendahului kualiti peluang sebenar.`
    }
  },
  clearance_off_line: {
    en: {
      casual: (f) => `The win chance barely moved because the score didn’t change, but this was huge. If that header goes in, it’s level and Northbridge drop to ${f.hC}%.`,
      home: (f) => `${f.other}, hero. Sprinted ${f.recoveryM} metres back to clear it off the line. Without that, we’re level and down to ${f.hC}%.`,
      away: (f) => `So close. ${f.player}’s header was in until ${f.other} got back. If that goes in, we’re level and up to ${f.aC}%.`,
      analyst: (f) => `Header xG ${f.xg} cleared on the line after a ${f.sprint} km/h recovery run. Actual swing ${signed(f.hA - f.hB)} pts; counterfactual ${signed(f.hC - f.hB)} pts.`
    },
    zh: {
      casual: (f) => `比分没变，所以胜率几乎没动，但这一下至关重要。如果那个头球进了，比分扳平，北桥的胜率会降到${f.hC}%。`,
      home: (f, n) => `${n(f.other)}救了我们！回追${f.recoveryM}米在门线上把球解围。没有他，比分就平了，胜率只剩${f.hC}%。`,
      away: (f, n) => `就差一点！${n(f.player)}的头球眼看要进，${n(f.other)}回追解围。要是进了，比分扳平，我们的胜率升到${f.aC}%。`,
      analyst: (f) => `头球xG ${f.xg}，回追速度${f.sprint}公里/小时后在门线解围。实际波动${signed(f.hA - f.hB)}个百分点；反事实${signed(f.hC - f.hB)}个百分点。`
    },
    ms: {
      casual: (f) => `Peluang hampir tidak berubah kerana jaringan kekal sama, tetapi detik ini sangat penting. Jika tandukan itu masuk, kedudukan seri dan peluang Northbridge jatuh ke ${f.hC}%.`,
      home: (f) => `${f.other} wira kita! Berlari ${f.recoveryM} meter ke belakang untuk menyelamatkan bola di garisan. Tanpanya, kedudukan seri dan peluang kita hanya ${f.hC}%.`,
      away: (f) => `Hampir! Tandukan ${f.player} hampir masuk sebelum ${f.other} sempat kembali. Jika masuk, kedudukan seri dan peluang kita naik ke ${f.aC}%.`,
      analyst: (f) => `Tandukan xG ${f.xg} diselamatkan di garisan selepas larian pemulihan ${f.sprint} km/j. Perubahan sebenar ${signed(f.hA - f.hB)} mata; kontrafaktual ${signed(f.hC - f.hB)} mata.`
    }
  },
  counter_goal: {
    en: {
      casual: () => `Northbridge lost the ball in midfield and Harbour punished them on the break. Level again, and the game is wide open.`,
      home: (f) => `Sloppy. One loose pass in midfield and ${f.player} was gone. We drop from ${f.hB}% to ${f.hA}%.`,
      away: (f) => `${f.player}! Won it in midfield, three passes, and we’re level. Our win chance jumps from ${f.aB}% to ${f.aA}%.`,
      analyst: (f) => `Turnover at ${f.turnoverM}m led to a three-pass counter: ${f.passM}m through ball (difficulty ${f.difficulty}), finish xG ${f.xg}. Win probability ${f.hB}% → ${f.hA}%.`
    },
    zh: {
      casual: () => `北桥在中场丢球，港口竞技打出快速反击。比分再次扳平，比赛悬念重现。`,
      home: (f, n) => `太随意了。中场一脚传球失误，${n(f.player)}就冲了出去。胜率从${f.hB}%跌到${f.hA}%。`,
      away: (f, n) => `${n(f.player)}！中场抢断，三脚传递，扳平比分！我们的胜率从${f.aB}%跃升到${f.aA}%。`,
      analyst: (f) => `${f.turnoverM}米处失误引发三脚传递的反击：${f.passM}米直塞（难度${f.difficulty}），射门xG ${f.xg}。胜率${f.hB}% → ${f.hA}%。`
    },
    ms: {
      casual: () => `Northbridge kehilangan bola di tengah padang dan Harbour menghukum mereka dengan serangan balas. Kedudukan seri semula, perlawanan terbuka luas.`,
      home: (f) => `Cuai. Satu hantaran longgar di tengah dan ${f.player} terus pergi. Peluang kita jatuh dari ${f.hB}% ke ${f.hA}%.`,
      away: (f) => `${f.player}! Rampas bola di tengah, tiga hantaran, dan kita seri. Peluang kita menang melonjak dari ${f.aB}% ke ${f.aA}%.`,
      analyst: (f) => `Kehilangan bola pada ${f.turnoverM}m membawa serangan balas tiga hantaran: hantaran terobos ${f.passM}m (kesukaran ${f.difficulty}), xG penyudah ${f.xg}. Kebarangkalian menang ${f.hB}% → ${f.hA}%.`
    }
  },
  penalty_saved: {
    en: {
      casual: (f) => `Harbour’s keeper just saved a penalty. That one moment took Northbridge from ${favour(f.hB)} to ${favour(f.hA)}.`,
      home: (f) => `Gutting. ${f.player}’s penalty saved, and our win chance drops from ${f.hB}% to ${f.hA}%. Still ${f.minsLeft} minutes to put it right.`,
      away: (f) => `${f.other}, what a save. ${f.player} scores that and we’re down to ${f.aC}%. Instead we’re at ${f.aA}% and still in this.`,
      analyst: (f) => `Penalty (xG ${f.xg}) not converted at ${f.minute}′. Win probability ${f.hB}% → ${f.hA}% over every possible scoreline. ${B5(f)}`
    },
    zh: {
      casual: (f) => `港口竞技门将扑出了点球。就这一下，北桥从${favour(f.hB, 'zh')}变成了${favour(f.hA, 'zh')}。`,
      home: (f, n) => `太难受了。${n(f.player)}的点球被扑，胜率从${f.hB}%跌到${f.hA}%。还有${f.minsLeft}分钟可以挽回。`,
      away: (f, n) => `${n(f.other)}，神扑！${n(f.player)}要是罚进，我们的胜率只剩${f.aC}%。现在我们还有${f.aA}%，比赛还没结束。`,
      analyst: (f) => `第${f.minute}分钟点球（xG ${f.xg}）未罚进。精确计算所有可能比分，胜率${f.hB}% → ${f.hA}%。${f.b5Xg < 0.05 ? `港口竞技${f.b5Minute}分钟改打五后卫后，尚未让对手在运动战中起脚。` : `港口竞技${f.b5Minute}分钟改打五后卫后，运动战仅被打出${f.b5Xg}的xG。`}`
    },
    ms: {
      casual: (f) => `Penjaga gol Harbour baru sahaja menyelamatkan sepakan penalti. Detik itu mengubah Northbridge daripada ${favour(f.hB, 'ms')} kepada ${favour(f.hA, 'ms')}.`,
      home: (f) => `Pedih. Penalti ${f.player} diselamatkan dan peluang kita menang jatuh dari ${f.hB}% ke ${f.hA}%. Masih ada ${f.minsLeft} minit untuk membetulkannya.`,
      away: (f) => `${f.other}, selamatan yang hebat! Jika ${f.player} menjaringkan, peluang kita tinggal ${f.aC}%. Sebaliknya kita kini ${f.aA}% dan masih dalam perlawanan.`,
      analyst: (f) => `Penalti (xG ${f.xg}) gagal disempurnakan pada minit ke-${f.minute}. Kebarangkalian menang ${f.hB}% → ${f.hA}% merentasi setiap kemungkinan keputusan. ${f.b5Xg < 0.05 ? `Sejak Harbour bertukar kepada lima pertahanan pada minit ke-${f.b5Minute}, lawan belum melepaskan rembatan dalam permainan terbuka.` : `Sejak Harbour bertukar kepada lima pertahanan pada minit ke-${f.b5Minute}, mereka hanya membenarkan ${f.b5Xg} xG dalam permainan terbuka.`}`
    },
    ta: {
      casual: () => `ஹார்பர் கோல்கீப்பர் இப்போது ஒரு பெனால்டியைத் தடுத்துவிட்டார். அந்த ஒரு தருணம் நார்த்பிரிட்ஜின் வெற்றி வாய்ப்பை பெரிதும் மாற்றியது.`,
      home: (f, n) => `மிகவும் வேதனை. ${n(f.player)}இன் பெனால்டி தடுக்கப்பட்டது, நமது வெற்றி வாய்ப்பு ${f.hB}% இலிருந்து ${f.hA}% ஆகக் குறைந்தது. சரிசெய்ய இன்னும் ${f.minsLeft} நிமிடங்கள் உள்ளன.`,
      away: (f, n) => `${n(f.other)}, என்ன ஒரு தடுப்பு! ${n(f.player)} கோல் அடித்திருந்தால் நமது வாய்ப்பு ${f.aC}% ஆகியிருக்கும். இப்போது நாம் ${f.aA}% இல் இருக்கிறோம், போட்டியில் இன்னும் உயிரோடு இருக்கிறோம்.`,
      analyst: (f) => `${f.minute}′ இல் பெனால்டி (xG ${f.xg}) தவறவிடப்பட்டது. சாத்தியமான ஒவ்வொரு ஸ்கோரையும் கணக்கிட்டு வெற்றி வாய்ப்பு ${f.hB}% → ${f.hA}%.`
    },
    hi: {
      casual: () => `हार्बर के गोलकीपर ने अभी एक पेनल्टी बचाई है। उस एक पल ने नॉर्थब्रिज की जीत की संभावना को पूरी तरह बदल दिया।`,
      home: (f, n) => `बहुत दुख हुआ। ${n(f.player)} की पेनल्टी बच गई, और हमारी जीत की संभावना ${f.hB}% से गिरकर ${f.hA}% हो गई। अभी ${f.minsLeft} मिनट बाकी हैं।`,
      away: (f, n) => `${n(f.other)}, क्या बचाव! अगर ${n(f.player)} गोल कर देते तो हमारी संभावना सिर्फ़ ${f.aC}% रह जाती। अब हम ${f.aA}% पर हैं और मैच में बने हुए हैं।`,
      analyst: (f) => `${f.minute}′ पर पेनल्टी (xG ${f.xg}) चूकी। हर संभावित स्कोरलाइन पर जीत की संभावना ${f.hB}% → ${f.hA}%।`
    },
    es: {
      casual: () => `El portero del Harbour acaba de parar un penalti. Ese momento cambió por completo las opciones del Northbridge.`,
      home: (f) => `Qué dolor. Le paran el penalti a ${f.player} y nuestras opciones de ganar caen del ${f.hB}% al ${f.hA}%. Quedan ${f.minsLeft} minutos para arreglarlo.`,
      away: (f) => `${f.other}, qué parada. Si ${f.player} marca, nos quedamos con un ${f.aC}%. En cambio, estamos en un ${f.aA}% y seguimos vivos.`,
      analyst: (f) => `Penalti (xG ${num(f.xg, 2, 'es')}) fallado en el ${f.minute}′. Probabilidad de victoria del ${f.hB}% al ${f.hA}% sobre todos los marcadores posibles.`
    },
    pt: {
      casual: () => `O goleiro do Harbour acabou de defender um pênalti. Esse lance mudou completamente as chances do Northbridge.`,
      home: (f) => `Que dor. O pênalti do ${f.player} foi defendido e nossa chance de vitória cai de ${f.hB}% para ${f.hA}%. Ainda temos ${f.minsLeft} minutos para resolver isso.`,
      away: (f) => `${f.other}, que defesa! Se o ${f.player} marca, ficamos com ${f.aC}%. Em vez disso, estamos com ${f.aA}% e seguimos vivos.`,
      analyst: (f) => `Pênalti (xG ${num(f.xg, 2, 'pt')}) desperdiçado aos ${f.minute}′. Probabilidade de vitória de ${f.hB}% para ${f.hA}% sobre todos os placares possíveis.`
    }
  },
  double_save: {
    en: {
      casual: (f) => `Two saves in two seconds kept it level. If either goes in, Northbridge win ${f.hC}% of the time from here.`,
      home: (f) => `${f.player} had two goes and ${f.other} stopped both. Score either and we’re at ${f.hC}%, not ${f.hA}%.`,
      away: (f) => `${f.other} again! Two saves in ${f.gapS} seconds. Concede there and we’re down to ${f.aC}%.`,
      analyst: (f) => `Two shots, combined xG ${f.xg}, both saved. Actual swing ${signed(f.hA - f.hB)} pts; counterfactual ${signed(f.hC - f.hB)} pts.`
    },
    zh: {
      casual: (f) => `两秒内两次扑救，比分依旧持平。只要进一个，北桥的胜率就会是${f.hC}%。`,
      home: (f, n) => `${n(f.player)}连续两次起脚，都被${n(f.other)}扑出。进一个的话我们的胜率是${f.hC}%，而不是${f.hA}%。`,
      away: (f, n) => `又是${n(f.other)}！${f.gapS}秒内两次扑救。要是丢球，我们的胜率只剩${f.aC}%。`,
      analyst: (f) => `两次射门，合计xG ${f.xg}，均被扑出。实际波动${signed(f.hA - f.hB)}个百分点；反事实${signed(f.hC - f.hB)}个百分点。`
    },
    ms: {
      casual: (f) => `Dua selamatan dalam dua saat mengekalkan kedudukan seri. Jika salah satu masuk, Northbridge menang ${f.hC}% daripada simulasi.`,
      home: (f) => `${f.player} mencuba dua kali dan ${f.other} menyelamatkan kedua-duanya. Jaringkan satu dan peluang kita ${f.hC}%, bukan ${f.hA}%.`,
      away: (f) => `${f.other} lagi! Dua selamatan dalam ${f.gapS} saat. Jika bolos, peluang kita jatuh ke ${f.aC}%.`,
      analyst: (f) => `Dua rembatan, jumlah xG ${f.xg}, kedua-duanya diselamatkan. Perubahan sebenar ${signed(f.hA - f.hB)} mata; kontrafaktual ${signed(f.hC - f.hB)} mata.`
    }
  },
  late_header_winner: {
    en: {
      casual: (f) => `A late header from a corner, and the match flips completely. Harbour go from ${f.aB}% to ${f.aA}% to win.`,
      home: (f) => `${f.minsLeft} minutes from a point and we switch off at a corner. Our chance of taking anything falls from ${f.ptsB}% to ${f.ptsA}%.`,
      away: (f) => `${f.player}! A header from a corner and we go from hoping for a draw to ${f.aA}% to win it.`,
      analyst: (f) => `Set-piece header, xG ${f.xg}, at ${f.minute}′. Harbour win ${f.aB}% → ${f.aA}%${f.largest ? ', the largest swing of the match' : ''}.`
    },
    zh: {
      casual: (f) => `一记角球后的头球，比赛彻底逆转。港口竞技的胜率从${f.aB}%升到${f.aA}%。`,
      home: (f) => `距离拿到一分只差${f.minsLeft}分钟，角球防守却走神了。我们拿分的机会从${f.ptsB}%跌到${f.ptsA}%。`,
      away: (f, n) => `${n(f.player)}！角球头球破门，我们从盼着打平变成${f.aA}%的胜率。`,
      analyst: (f) => `定位球头球，xG ${f.xg}，第${f.minute}分钟。港口竞技胜率${f.aB}% → ${f.aA}%${f.largest ? '，全场最大的一次波动' : ''}。`
    },
    ms: {
      casual: (f) => `Tandukan lewat daripada sepakan sudut, dan perlawanan berubah sepenuhnya. Peluang Harbour menang naik dari ${f.aB}% ke ${f.aA}%.`,
      home: (f) => `${f.minsLeft} minit lagi untuk satu mata dan kita leka ketika sepakan sudut. Peluang kita mendapat sesuatu jatuh dari ${f.ptsB}% ke ${f.ptsA}%.`,
      away: (f) => `${f.player}! Tandukan dari sepakan sudut dan kita daripada berharap seri kepada ${f.aA}% untuk menang.`,
      analyst: (f) => `Tandukan bola mati, xG ${f.xg}, pada minit ke-${f.minute}. Harbour menang ${f.aB}% → ${f.aA}%${f.largest ? ', perubahan terbesar perlawanan' : ''}.`
    }
  }
};

/** The "WHAT IF" line under each turning point, from one side's point of view. */
export const WHAT_IF: Partial<Record<MomentKind, Partial<Record<Lang, (f: MomentFacts, side: 'home' | 'away', n: (s: string) => string) => string>>>> = {
  goal_long_range: {
    en: (f, s) => (s === 'home' ? `If that shot goes wide, Northbridge win ${f.hC}% of the time instead of ${f.hA}%.` : `If that shot goes wide, Harbour win ${f.aC}% of the time instead of ${f.aA}%.`),
    zh: (f, s) => (s === 'home' ? `如果那脚射偏，北桥的胜率是${f.hC}%，而不是${f.hA}%。` : `如果那脚射偏，港口竞技的胜率是${f.aC}%，而不是${f.aA}%。`),
    ms: (f, s) => (s === 'home' ? `Jika rembatan itu tersasar, Northbridge menang ${f.hC}% berbanding ${f.hA}%.` : `Jika rembatan itu tersasar, Harbour menang ${f.aC}% berbanding ${f.aA}%.`)
  },
  clearance_off_line: {
    en: (f, s) => (s === 'home' ? `If that header goes in, it’s ${f.cfScore} and Northbridge’s chances drop to ${f.hC}%.` : `If ${f.player}’s header goes in, it’s ${f.cfScore} and Harbour win ${f.aC}% of the time.`),
    zh: (f, s, n) => (s === 'home' ? `如果那个头球进了，比分${f.cfScore}，北桥的胜率降到${f.hC}%。` : `如果${n(f.player)}的头球进了，比分${f.cfScore}，港口竞技的胜率是${f.aC}%。`),
    ms: (f, s) => (s === 'home' ? `Jika tandukan itu masuk, ${f.cfScore} dan peluang Northbridge jatuh ke ${f.hC}%.` : `Jika tandukan ${f.player} masuk, ${f.cfScore} dan Harbour menang ${f.aC}%.`)
  },
  counter_goal: {
    en: (f, s) => (s === 'home' ? `If Northbridge keep the ball in midfield, they win ${f.hC}% of the time from there.` : `If Northbridge keep the ball, Harbour win only ${f.aC}% of the time from there.`),
    zh: (f, s) => (s === 'home' ? `如果北桥在中场保住球权，他们的胜率是${f.hC}%。` : `如果北桥保住球权，港口竞技的胜率只有${f.aC}%。`),
    ms: (f, s) => (s === 'home' ? `Jika Northbridge mengekalkan bola di tengah, mereka menang ${f.hC}% daripada situ.` : `Jika Northbridge mengekalkan bola, Harbour hanya menang ${f.aC}%.`)
  },
  penalty_saved: {
    en: (f, s) => (s === 'home' ? `If ${f.player} scores, Northbridge win ${f.hC}% of the time from here.` : `If ${f.player} scores, Harbour win just ${f.aC}% of the time from here.`),
    zh: (f, s, n) => (s === 'home' ? `如果${n(f.player)}罚进，北桥的胜率是${f.hC}%。` : `如果${n(f.player)}罚进，港口竞技的胜率只有${f.aC}%。`),
    ms: (f, s) => (s === 'home' ? `Jika ${f.player} menjaringkan, Northbridge menang ${f.hC}% daripada sini.` : `Jika ${f.player} menjaringkan, Harbour hanya menang ${f.aC}%.`)
  },
  double_save: {
    en: (f, s) => (s === 'home' ? `If either shot goes in, Northbridge win ${f.hC}% of the time.` : `If either goes in, Harbour’s chances drop to ${f.aC}%.`),
    zh: (f, s) => (s === 'home' ? `只要进一个，北桥的胜率是${f.hC}%。` : `只要丢一个，港口竞技的胜率降到${f.aC}%。`),
    ms: (f, s) => (s === 'home' ? `Jika salah satu masuk, Northbridge menang ${f.hC}%.` : `Jika salah satu masuk, peluang Harbour jatuh ke ${f.aC}%.`)
  },
  late_header_winner: {
    en: (f) => `If it’s cleared, the most likely result is a draw (${f.dC}%).`,
    zh: (f) => `如果被解围，最可能的结果是平局（${f.dC}%）。`,
    ms: (f) => `Jika bola itu dihalau, keputusan paling mungkin ialah seri (${f.dC}%).`
  }
};

/**
 * The scripted flagship match uses its hand-written templates where a language has them;
 * every other moment, match and language is written from the general families.
 */
export function swingText(scripted: boolean, kind: MomentKind, persona: Persona, lang: Lang, f: MomentFacts, pov: 'home' | 'away' = 'home'): { text: string; lang: Lang } {
  const bank = scripted ? SWING[kind]?.[lang] : undefined;
  if (bank) return { text: bank[persona](f, (x) => nameIn(x, lang), lang), lang };
  const side = persona === 'away' ? 'away' : persona === 'home' ? 'home' : pov;
  const sf = { ...forSide(f, side), kind };
  const voice = persona === 'casual' ? 'casual' : persona === 'analyst' ? 'analyst' : sf.mine ? 'for' : 'against';
  return { text: familyText(sf, voice, lang), lang };
}

export function whatIfText(scripted: boolean, kind: MomentKind, side: 'home' | 'away', lang: Lang, f: MomentFacts): string {
  const t = scripted ? WHAT_IF[kind]?.[lang] : undefined;
  if (t) return t(f, side, (x) => nameIn(x, lang));
  return familyWhatIf({ ...forSide(f, side), kind }, lang);
}
