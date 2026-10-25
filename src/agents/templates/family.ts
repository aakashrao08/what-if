// General Narrator templates for any turning point in any match, in seven languages.
// Two families: a goal (the branch takes it away) and a chance that didn't go in (the branch scores it).
// The scripted flagship match has hand-tuned templates in swing.ts; everything else is written from these.

import type { MomentKind } from '../../data/types';
import type { SideFacts } from '../analyst';
import { num, signed, type Lang } from '../format';
import { hashSeed } from '../../engine/rng';

type F = SideFacts & { distance?: number; kind: MomentKind };
type Voice = 'casual' | 'for' | 'against' | 'analyst';

interface Bank {
  goal: (f: F) => string; // "Nettleshaw scores for Northbridge from 22 metres"
  chance: (f: F) => string; // "Tallowby saves Bobbinford's penalty"
  goalV: Record<Voice, (f: F, p: string) => string>;
  chanceV: Record<Voice, (f: F, p: string) => string>;
  whatIfGoal: (f: F) => string;
  whatIfChance: (f: F) => string;
}

const longRange = (f: F) => f.kind === 'goal_long_range' && f.dist >= 18;

/** What a goal did, from the scoring side's view, using the score just after it. */
function goalKind(f: F): 'level' | 'ahead' | 'extend' | 'back' {
  const [h, a] = f.score.split('–').map(Number);
  const mine = f.side === 'home' ? h : a, theirs = f.side === 'home' ? a : h;
  return mine === theirs ? 'level' : mine === theirs + 1 ? 'ahead' : mine > theirs ? 'extend' : 'back';
}
/** One of a few ways to say it, fixed per moment so the card reads the same on every visit. */
const pick = (f: F, options: string[]) => options[hashSeed(f.player, f.minute) % options.length];

export const FAMILY: Record<Lang, Bank> = {
  en: {
    goal: (f) => `${f.player} scores for ${f.T}${longRange(f) ? ` from ${f.dist} metres` : ''}${f.late ? ' late on' : ''}`,
    chance: (f) => ({
      big_miss: `${f.player} misses a big chance for ${f.T}`,
      big_save: `${f.other} saves from ${f.player}`,
      clearance_off_line: `${f.other} clears ${f.player}’s effort off the line`,
      double_save: `${f.other} makes two saves in two seconds from ${f.player}`,
      penalty_saved: `${f.other} saves ${f.player}’s penalty`
    } as Record<string, string>)[f.kind] ?? `${f.player} is denied`,
    // goals say what they did to the game: level it, put a side ahead, put it out of reach, or start a comeback
    goalV: {
      casual: (f) => {
        const k = goalKind(f), from = longRange(f) ? ` from ${f.dist} metres` : '';
        if (k === 'level') return pick(f, [`${f.player} levels it for ${f.T}${from} (${f.score}). Their chance of winning goes from ${f.tB}% to ${f.tA}%.`, `${f.score}: ${f.player}${from} brings ${f.T} level, and their win chance from ${f.tB}% to ${f.tA}%.`]);
        if (k === 'ahead') return pick(f, [`${f.player} puts ${f.T} ahead${from}${f.late ? ' late on' : ''}. Win chance: ${f.tB}% → ${f.tA}%.`, `${f.T} lead through ${f.player}${from}, and now win ${f.tA}% of the time (from ${f.tB}%).`]);
        if (k === 'extend') return f.tA >= 98 ? `${f.player} makes it ${f.score}${from}, and that should be that.` : `${f.player} makes it ${f.score}${from}. ${f.T} now win ${f.tA}% of the time.`;
        return `${f.player} pulls one back for ${f.T}${from} (${f.score}). Their chance climbs from ${f.tB}% to ${f.tA}%.`;
      },
      for: (f) => {
        const k = goalKind(f), from = longRange(f) ? ` From ${f.dist} metres.` : '';
        if (k === 'level') return `${f.player}! Level at ${f.score}.${from} Our win chance is back up from ${f.mB}% to ${f.mA}%.`;
        if (k === 'ahead') return pick(f, [`${f.player} puts us in front!${from} ${f.mB}% → ${f.mA}% to win.`, `${f.player}!${from} We lead, and win ${f.mA}% of the time from here (was ${f.mB}%).`]);
        if (k === 'extend') return f.mA >= 98 ? `${f.player} makes it ${f.score}.${from} That should be that.` : `${f.player} makes it ${f.score}.${from} We win ${f.mA}% of the time from here.`;
        return `${f.player} gives us a chance: ${f.score}, and our win chance up from ${f.mB}% to ${f.mA}%.`;
      },
      against: (f) => {
        const k = goalKind(f), time = f.minsLeft >= 10 ? `, with ${f.minsLeft} minutes to respond` : f.minsLeft > 0 ? ', and almost no time left' : '';
        if (k === 'level') return `${f.T} are level through ${f.player} (${f.score}). Our win chance falls from ${f.mB}% to ${f.mA}%.`;
        if (k === 'ahead') return pick(f, [`${f.player} puts ${f.T} in front. We drop from ${f.mB}% to ${f.mA}%${time}.`, `Behind. ${f.player} scores for ${f.T}, and our win chance goes from ${f.mB}% to ${f.mA}%${time}.`]);
        if (k === 'extend') return f.mA <= 2 ? `${f.player} makes it ${f.score}. That’s as good as over.` : `${f.player} makes it ${f.score}. We’re down to ${f.mA}%.`;
        return `${f.player} pulls one back for ${f.T}. We’re still on ${f.mA}%, but it’s nervier.`;
      },
      analyst: (f) => `Goal (${f.score}, ${f.minute}′), xG ${f.xg}${f.dist ? `, ${f.dist} m` : ''}. ${f.T} win ${f.tB}% → ${f.tA}%.`
    },
    // a chance that didn't go in is only worth a line if it would have changed the game
    chanceV: {
      casual: (f, p) => {
        const d = Math.abs(f.tC - f.tA);
        if (d >= 20) return pick(f, [`${p}. That was a big one: scored, ${f.T} would win ${f.tC}% of the time, not ${f.tA}%.`, `${p}, and it mattered. A goal there takes ${f.T} from ${f.tA}% to ${f.tC}%.`]);
        if (d >= 8) return `${p}. A goal there would have taken ${f.T} to ${f.tC}%.`;
        return `${p}, though it wouldn’t have changed much (${f.tC}% instead of ${f.tA}%).`;
      },
      for: (f, p) => {
        const d = Math.abs(f.mC - f.mA);
        if (d >= 20) return pick(f, [`So close. ${p}. That one would have taken us to ${f.mC}%.`, `${p}. Score that and we’re at ${f.mC}%, not ${f.mA}%.`]);
        return `${p}. It wouldn’t have changed much: ${f.mC}% instead of ${f.mA}%.`;
      },
      against: (f, p) => {
        const d = Math.abs(f.mC - f.mA);
        if (d >= 20) return pick(f, [`Let off. ${p}. Had it gone in, we’d be down to ${f.mC}%.`, `${p}. A big escape: a goal there drops us to ${f.mC}%.`]);
        return `${p}. Less dangerous than it looked: we’d still be on ${f.mC}%.`;
      },
      analyst: (f, p) => `${p} (xG ${f.xg}). Real swing ${signed(f.tSw)} pts; scored, ${signed(f.tCf)} pts.`
    },
    whatIfGoal: (f) => {
      const d = f.mC - f.mA;
      if (Math.abs(d) < 5) return Math.min(f.mC, f.mA) >= 90 ? `Even without that goal, ${f.S} are still clear favourites.` : Math.max(f.mC, f.mA) <= 10 ? `Even without that goal, ${f.S} would have been up against it.` : `Without that goal it changes little: ${f.S} win ${f.mC}% of the time instead of ${f.mA}%.`;
      return f.mine
        ? pick(f, [`Take that goal away and ${f.S} win ${f.mC}% of the time, not ${f.mA}%.`, `Without it, ${f.S} would be on ${f.mC}% instead of ${f.mA}%.`])
        : `Without that goal, ${f.S} would be on ${f.mC}% instead of ${f.mA}%.`;
    },
    whatIfChance: (f) => {
      const d = f.mC - f.mA;
      if (Math.abs(d) < 5) return Math.max(f.mC, f.mA) <= 10 ? `Even if it had gone in, ${f.S} would still have been up against it.` : Math.min(f.mC, f.mA) >= 90 ? `It barely mattered: ${f.S} were clear favourites either way.` : `Even if it had gone in, ${f.S} move only to ${f.mC}% (from ${f.mA}%).`;
      return f.mine
        ? pick(f, [`Had it gone in, ${f.S} would win ${f.mC}% of the time instead of ${f.mA}%.`, `Bury that and ${f.S} are up to ${f.mC}%, from ${f.mA}%.`])
        : `Had it gone in, ${f.S} would have dropped to ${f.mC}%.`;
    }
  },
  zh: {
    goal: (f) => `${f.player}为${f.T}破门${longRange(f) ? `（${f.dist}米外远射）` : ''}${f.late ? '，比赛末段' : ''}`,
    chance: (f) => ({
      big_miss: `${f.player}错失了为${f.T}得分的良机`,
      big_save: `${f.other}扑出了${f.player}的射门`,
      clearance_off_line: `${f.other}在门线上解围了${f.player}的射门`,
      double_save: `${f.other}两秒内两次扑出${f.player}的射门`,
      penalty_saved: `${f.other}扑出了${f.player}的点球`
    } as Record<string, string>)[f.kind] ?? `${f.player}的射门被阻挡`,
    goalV: {
      casual: (f, p) => `${p}。${f.T}的胜率从${f.tB}%升到${f.tA}%。`,
      for: (f) => `${f.player}进了！${longRange(f) ? `${f.dist}米外。` : ''}我们的胜率从${f.mB}%升到${f.mA}%。`,
      against: (f, p) => `${p}。我们的胜率从${f.mB}%跌到${f.mA}%。${f.minsLeft >= 10 ? `还有${f.minsLeft}分钟。` : ''}`,
      analyst: (f) => `进球，xG ${f.xg}${f.dist ? `，${f.dist}米` : ''}，第${f.minute}分钟。${f.T}胜率${f.tB}% → ${f.tA}%（精确计算）。`
    },
    chanceV: {
      casual: (f, p) => `${p}。如果进了，${f.T}的胜率是${f.tC}%，而不是${f.tA}%。`,
      for: (f, p) => `就差一点！${p}。进了的话我们的胜率是${f.mC}%，而不是${f.mA}%。`,
      against: (f, p) => `逃过一劫。${p}。要是进了，我们的胜率会跌到${f.mC}%。`,
      analyst: (f, p) => `${p}（xG ${f.xg}）。实际波动${signed(f.tSw)}个百分点；反事实${signed(f.tCf)}个百分点（精确计算）。`
    },
    whatIfGoal: (f) => `如果那球没进，${f.S}的胜率是${f.mC}%，而不是${f.mA}%。`,
    whatIfChance: (f) => `如果那球进了，${f.S}的胜率是${f.mC}%，而不是${f.mA}%。`
  },
  ms: {
    goal: (f) => `${f.player} menjaringkan gol untuk ${f.T}${longRange(f) ? ` dari jarak ${f.dist} meter` : ''}${f.late ? ' di penghujung perlawanan' : ''}`,
    chance: (f) => ({
      big_miss: `${f.player} mensia-siakan peluang keemasan untuk ${f.T}`,
      big_save: `${f.other} menyelamatkan rembatan ${f.player}`,
      clearance_off_line: `${f.other} menyelamatkan cubaan ${f.player} di garisan gol`,
      double_save: `${f.other} membuat dua selamatan dalam dua saat daripada ${f.player}`,
      penalty_saved: `${f.other} menyelamatkan penalti ${f.player}`
    } as Record<string, string>)[f.kind] ?? `Cubaan ${f.player} disekat`,
    goalV: {
      casual: (f, p) => `${p}. Peluang ${f.T} menang berubah dari ${f.tB}% ke ${f.tA}%.`,
      for: (f) => `${f.player}! ${longRange(f) ? `Dari ${f.dist} meter. ` : ''}Peluang kita menang naik dari ${f.mB}% ke ${f.mA}%.`,
      against: (f, p) => `${p}. Peluang kita menang jatuh dari ${f.mB}% ke ${f.mA}%.${f.minsLeft >= 10 ? ` Masih ada ${f.minsLeft} minit.` : ''}`,
      analyst: (f) => `Gol, xG ${f.xg}${f.dist ? `, ${f.dist} m` : ''}, minit ke-${f.minute}. ${f.T} menang ${f.tB}% → ${f.tA}% (tepat).`
    },
    chanceV: {
      casual: (f, p) => `${p}. Jika masuk, ${f.T} menang ${f.tC}% berbanding ${f.tA}%.`,
      for: (f, p) => `Hampir! ${p}. Jaringkan itu dan peluang kita ${f.mC}%, bukan ${f.mA}%.`,
      against: (f, p) => `Nasib baik. ${p}. Jika masuk, peluang kita jatuh ke ${f.mC}%.`,
      analyst: (f, p) => `${p} (xG ${f.xg}). Perubahan sebenar ${signed(f.tSw)} mata; kontrafaktual ${signed(f.tCf)} mata (tepat).`
    },
    whatIfGoal: (f) => `Jika gol itu tidak berlaku, ${f.S} menang ${f.mC}% berbanding ${f.mA}%.`,
    whatIfChance: (f) => `Jika bola itu masuk, ${f.S} menang ${f.mC}% berbanding ${f.mA}%.`
  },
  ta: {
    goal: (f) => `${f.player} ${f.T} அணிக்காக ${longRange(f) ? `${f.dist} மீட்டர் தூரத்திலிருந்து ` : ''}கோல் அடித்தார்${f.late ? ' (ஆட்டத்தின் இறுதியில்)' : ''}`,
    chance: (f) => ({
      big_miss: `${f.player} ${f.T} அணிக்கான பெரிய வாய்ப்பைத் தவறவிட்டார்`,
      big_save: `${f.player}இன் ஷாட்டை ${f.other} தடுத்தார்`,
      clearance_off_line: `${f.player}இன் முயற்சியை ${f.other} கோல் கோட்டில் தடுத்தார்`,
      double_save: `${f.other} இரண்டு வினாடிகளில் ${f.player}இன் இரண்டு ஷாட்களைத் தடுத்தார்`,
      penalty_saved: `${f.player}இன் பெனால்டியை ${f.other} தடுத்தார்`
    } as Record<string, string>)[f.kind] ?? `${f.player}இன் முயற்சி தடுக்கப்பட்டது`,
    goalV: {
      casual: (f, p) => `${p}. ${f.T} அணியின் வெற்றி வாய்ப்பு ${f.tB}% இலிருந்து ${f.tA}% ஆக மாறியது.`,
      for: (f) => `${f.player}! நமது வெற்றி வாய்ப்பு ${f.mB}% இலிருந்து ${f.mA}% ஆக உயர்ந்தது.`,
      against: (f, p) => `${p}. நமது வெற்றி வாய்ப்பு ${f.mB}% இலிருந்து ${f.mA}% ஆகக் குறைந்தது.${f.minsLeft >= 10 ? ` இன்னும் ${f.minsLeft} நிமிடங்கள் உள்ளன.` : ''}`,
      analyst: (f) => `கோல், xG ${f.xg}, ${f.minute}′. ${f.T} வெற்றி ${f.tB}% → ${f.tA}% (துல்லியம்).`
    },
    chanceV: {
      casual: (f, p) => `${p}. அது கோலாகியிருந்தால், ${f.T} வெற்றி வாய்ப்பு ${f.tA}% அல்ல, ${f.tC}%.`,
      for: (f, p) => `மிக அருகில்! ${p}. அது கோலாகியிருந்தால் நமது வாய்ப்பு ${f.mA}% அல்ல, ${f.mC}%.`,
      against: (f, p) => `தப்பித்தோம். ${p}. அது கோலாகியிருந்தால் நமது வாய்ப்பு ${f.mC}% ஆகக் குறைந்திருக்கும்.`,
      analyst: (f, p) => `${p} (xG ${f.xg}). உண்மையான மாற்றம் ${signed(f.tSw)}; மாற்று நிகழ்வு ${signed(f.tCf)} (துல்லியம்).`
    },
    whatIfGoal: (f) => `அந்த கோல் இல்லாவிட்டால், ${f.S} வெற்றி வாய்ப்பு ${f.mA}% அல்ல, ${f.mC}%.`,
    whatIfChance: (f) => `அது கோலாகியிருந்தால், ${f.S} வெற்றி வாய்ப்பு ${f.mA}% அல்ல, ${f.mC}%.`
  },
  hi: {
    goal: (f) => `${f.player} ने ${f.T} के लिए ${longRange(f) ? `${f.dist} मीटर से ` : ''}गोल किया${f.late ? ' (मैच के आख़िरी पलों में)' : ''}`,
    chance: (f) => ({
      big_miss: `${f.player} ने ${f.T} के लिए बड़ा मौका गंवाया`,
      big_save: `${f.other} ने ${f.player} का शॉट रोका`,
      clearance_off_line: `${f.other} ने ${f.player} का प्रयास गोल-लाइन पर रोका`,
      double_save: `${f.other} ने दो सेकंड में ${f.player} के दो शॉट रोके`,
      penalty_saved: `${f.other} ने ${f.player} की पेनल्टी बचाई`
    } as Record<string, string>)[f.kind] ?? `${f.player} का प्रयास रोका गया`,
    goalV: {
      casual: (f, p) => `${p}। ${f.T} की जीत की संभावना ${f.tB}% से ${f.tA}% हो गई।`,
      for: (f) => `${f.player}! हमारी जीत की संभावना ${f.mB}% से बढ़कर ${f.mA}% हो गई।`,
      against: (f, p) => `${p}। हमारी जीत की संभावना ${f.mB}% से गिरकर ${f.mA}% हो गई।${f.minsLeft >= 10 ? ` अभी ${f.minsLeft} मिनट बाकी हैं।` : ''}`,
      analyst: (f) => `गोल, xG ${f.xg}, ${f.minute}′। ${f.T} जीत ${f.tB}% → ${f.tA}% (सटीक)।`
    },
    chanceV: {
      casual: (f, p) => `${p}। अगर गोल होता, तो ${f.T} की जीत की संभावना ${f.tA}% नहीं, ${f.tC}% होती।`,
      for: (f, p) => `बस थोड़ा सा! ${p}। गोल होता तो हम ${f.mA}% नहीं, ${f.mC}% पर होते।`,
      against: (f, p) => `बच गए। ${p}। अगर गोल होता, तो हमारी संभावना ${f.mC}% रह जाती।`,
      analyst: (f, p) => `${p} (xG ${f.xg})। वास्तविक बदलाव ${signed(f.tSw)}; वैकल्पिक परिणाम ${signed(f.tCf)} (सटीक)।`
    },
    whatIfGoal: (f) => `अगर वह गोल न होता, तो ${f.S} की जीत की संभावना ${f.mA}% नहीं, ${f.mC}% होती।`,
    whatIfChance: (f) => `अगर वह गोल होता, तो ${f.S} की जीत की संभावना ${f.mA}% नहीं, ${f.mC}% होती।`
  },
  es: {
    goal: (f) => `${f.player} marca para el ${f.T}${longRange(f) ? ` desde ${f.dist} metros` : ''}${f.late ? ' en el tramo final' : ''}`,
    chance: (f) => ({
      big_miss: `${f.player} falla una ocasión clarísima para el ${f.T}`,
      big_save: `${f.other} le para el disparo a ${f.player}`,
      clearance_off_line: `${f.other} saca bajo palos el remate de ${f.player}`,
      double_save: `${f.other} hace dos paradas en dos segundos ante ${f.player}`,
      penalty_saved: `${f.other} le para el penalti a ${f.player}`
    } as Record<string, string>)[f.kind] ?? `${f.player} no puede marcar`,
    goalV: {
      casual: (f, p) => `${p}. Las opciones de victoria del ${f.T} pasan del ${f.tB}% al ${f.tA}%.`,
      for: (f) => `¡${f.player}! ${longRange(f) ? `Desde ${f.dist} metros. ` : ''}Nuestras opciones pasan del ${f.mB}% al ${f.mA}%.`,
      against: (f, p) => `${p}. Nuestras opciones caen del ${f.mB}% al ${f.mA}%.${f.minsLeft >= 10 ? ` Quedan ${f.minsLeft} minutos.` : ''}`,
      analyst: (f) => `Gol, xG ${num(f.xg, 2, 'es')}${f.dist ? `, ${f.dist} m` : ''}, ${f.minute}′. Victoria del ${f.T} ${f.tB}% → ${f.tA}% (exacto).`
    },
    chanceV: {
      casual: (f, p) => `${p}. Si entra, el ${f.T} gana el ${f.tC}% de las veces en lugar del ${f.tA}%.`,
      for: (f, p) => `Por poco. ${p}. Si entra, estaríamos en un ${f.mC}%, no en un ${f.mA}%.`,
      against: (f, p) => `Nos salvamos. ${p}. Si entra, caemos al ${f.mC}%.`,
      analyst: (f, p) => `${p} (xG ${num(f.xg, 2, 'es')}). Cambio real ${signed(f.tSw)} pts; contrafactual ${signed(f.tCf)} pts (exacto).`
    },
    whatIfGoal: (f) => `Sin ese gol, el ${f.S} gana el ${f.mC}% de las veces en lugar del ${f.mA}%.`,
    whatIfChance: (f) => `Si entra, el ${f.S} gana el ${f.mC}% de las veces en lugar del ${f.mA}%.`
  },
  pt: {
    goal: (f) => `${f.player} marca para o ${f.T}${longRange(f) ? ` de ${f.dist} metros` : ''}${f.late ? ' no fim do jogo' : ''}`,
    chance: (f) => ({
      big_miss: `${f.player} perde uma chance clara para o ${f.T}`,
      big_save: `${f.other} defende o chute de ${f.player}`,
      clearance_off_line: `${f.other} tira em cima da linha a finalização de ${f.player}`,
      double_save: `${f.other} faz duas defesas em dois segundos contra ${f.player}`,
      penalty_saved: `${f.other} defende o pênalti de ${f.player}`
    } as Record<string, string>)[f.kind] ?? `${f.player} não consegue marcar`,
    goalV: {
      casual: (f, p) => `${p}. A chance de vitória do ${f.T} vai de ${f.tB}% para ${f.tA}%.`,
      for: (f) => `${f.player}! ${longRange(f) ? `De ${f.dist} metros. ` : ''}Nossa chance de vitória vai de ${f.mB}% para ${f.mA}%.`,
      against: (f, p) => `${p}. Nossa chance de vitória cai de ${f.mB}% para ${f.mA}%.${f.minsLeft >= 10 ? ` Ainda faltam ${f.minsLeft} minutos.` : ''}`,
      analyst: (f) => `Gol, xG ${num(f.xg, 2, 'pt')}${f.dist ? `, ${f.dist} m` : ''}, ${f.minute}′. Vitória do ${f.T} ${f.tB}% → ${f.tA}% (exato).`
    },
    chanceV: {
      casual: (f, p) => `${p}. Se entra, o ${f.T} vence ${f.tC}% das vezes em vez de ${f.tA}%.`,
      for: (f, p) => `Quase. ${p}. Se entra, estaríamos com ${f.mC}%, não ${f.mA}%.`,
      against: (f, p) => `Escapamos. ${p}. Se entra, caímos para ${f.mC}%.`,
      analyst: (f, p) => `${p} (xG ${num(f.xg, 2, 'pt')}). Mudança real ${signed(f.tSw)} pts; contrafactual ${signed(f.tCf)} pts (exato).`
    },
    whatIfGoal: (f) => `Sem esse gol, o ${f.S} vence ${f.mC}% das vezes em vez de ${f.mA}%.`,
    whatIfChance: (f) => `Se entra, o ${f.S} vence ${f.mC}% das vezes em vez de ${f.mA}%.`
  }
};

export function familyText(f: F, voice: Voice, lang: Lang): string {
  const b = FAMILY[lang];
  if (f.isGoal) return b.goalV[voice](f, b.goal(f));
  return b.chanceV[voice](f, b.chance(f));
}

export function familyWhatIf(f: F, lang: Lang): string {
  const b = FAMILY[lang];
  return f.isGoal ? b.whatIfGoal(f) : b.whatIfChance(f);
}
