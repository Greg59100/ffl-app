module.exports = async function handler(req, res) {
  // Vercel envoie Authorization: Bearer <CRON_SECRET>
// On accepte aussi x-cron-secret pour les tests manuels
const authHeader = req.headers['authorization'] || '';
const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
const isManualTest = req.headers['x-cron-secret'] === process.env.CRON_SECRET;
if (!isVercelCron && !isManualTest) {
  return res.status(401).json({ error: 'Unauthorized' });
}
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY;

  try {
    const standingsRes = await fetch('https://ffl-app-tau.vercel.app/api/standings');
    const standingsData = await standingsRes.json();
    const table = standingsData.standings[0].table;
    const matchday = standingsData.season.currentMatchday;

    const leaguesRes = await fetch(
      SUPABASE_URL + '/rest/v1/leagues?select=id,name,stake',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    const leagues = await leaguesRes.json();

    for (const league of leagues) {
      const membersRes = await fetch(
        SUPABASE_URL + '/rest/v1/league_members?league_id=eq.' + league.id + '&select=user_id',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
      );
      const members = await membersRes.json();
      if (!members.length) continue;

      const userIds = members.map(m => m.user_id);

      const profilesRes = await fetch(
        SUPABASE_URL + '/rest/v1/profiles?id=in.(' + userIds.join(',') + ')&select=id,display_name,username',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
      );
      const profiles = await profilesRes.json();

      const pronosRes = await fetch(
        SUPABASE_URL + '/rest/v1/pronostics?league_id=eq.' + league.id + '&select=user_id,ranking',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
      );
      const pronos = await pronosRes.json();

      const TLA_TO_ID = {
        'PSG':'psg','RCL':'rcl','MAR':'om','LYO':'ol','ASM':'asm',
        'REN':'srfc','LIL':'losc','FCL':'fcl','RC ':'rcst','BRE':'fcm',
        'ANG':'ang','TOU':'tfc','PFC':'pfc','NIC':'ogcn','HAC':'hac',
        'AJA':'aia','NAN':'fcn','FCM':'fcmetz'
      };

      function calcScore(prono) {
        if (!prono || !prono.length) return 0;
        let total = 0;
        prono.forEach((teamId, idx) => {
          const realPos = table.findIndex(t => TLA_TO_ID[t.team.tla?.trim()] === teamId);
          if (realPos === -1) return;
          const diff = Math.abs(idx - realPos);
          let pts = diff===0?100:diff===1?70:diff===2?40:diff===3?20:diff===4?10:0;
          if (diff===0 && idx<3) pts += 50;
          if (diff===0 && idx>=15) pts += 30;
          total += pts;
        });
        return total;
      }

      const ranked = profiles.map(p => {
        const prono = pronos.find(pr => pr.user_id === p.id);
        return { name: p.display_name || p.username || 'Joueur', score: calcScore(prono?.ranking || []) };
      }).sort((a, b) => b.score - a.score);

      const medals = ['🥇', '🥈', '🥉'];
      const rankingHtml = ranked.map((p, i) => `<tr><td style="padding:8px 16px;font-size:20px">${medals[i] || (i+1)+'.'}</td><td style="padding:8px 16px;font-weight:600">${p.name}</td><td style="padding:8px 16px;text-align:right;font-weight:800;color:#00d45a;font-size:18px">${p.score.toLocaleString('fr')} pts</td></tr>`).join('');
      const standingsHtml = table.slice(0,5).map((t, i) => `<tr><td style="padding:6px 12px;color:#777">${i+1}</td><td style="padding:6px 12px;font-weight:600">${t.team.shortName}</td><td style="padding:6px 12px;text-align:right;font-weight:700">${t.points} pts</td></tr>`).join('');

      const authRes = await fetch(
        SUPABASE_URL + '/auth/v1/admin/users',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
      );
      const authData = await authRes.json();
      const authUsers = authData.users || [];

      for (const profile of profiles) {
        const authUser = authUsers.find(u => u.id === profile.id);
        if (!authUser?.email) continue;
        const myRank = ranked.findIndex(p => p.name === (profile.display_name || profile.username)) + 1;
        const myScore = ranked.find(p => p.name === (profile.display_name || profile.username))?.score || 0;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'FFL <onboarding@resend.dev>',
            to: authUser.email,
            subject: `🏆 FFL ${league.name} — Classement J${matchday}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#080808;color:#f2f2f2;border-radius:12px;overflow:hidden"><div style="background:linear-gradient(135deg,#0d2617,#080808);padding:24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1)"><div style="font-size:28px;font-weight:900;text-transform:uppercase;letter-spacing:2px">FRIENDS <span style="color:#00d45a">FARMERS</span> LEAGUE</div><div style="color:#777;font-size:12px;letter-spacing:3px;margin-top:6px">RÉSUMÉ DE LA JOURNÉE ${matchday}</div></div><div style="padding:20px"><div style="background:#181818;border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px;margin-bottom:16px;text-align:center"><div style="font-size:12px;color:#777;text-transform:uppercase;letter-spacing:1px">Ta position</div><div style="font-size:48px;font-weight:900;color:#f5e232">${myRank}</div><div style="font-size:24px;font-weight:800;color:#00d45a">${myScore.toLocaleString('fr')} pts</div></div><div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;color:#777">Classement ${league.name}</div><table style="width:100%;background:#181818;border-radius:10px;overflow:hidden;border-collapse:collapse">${rankingHtml}</table><div style="margin-top:16px"><div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;color:#777">Top 5 Ligue 1 — J${matchday}</div><table style="width:100%;background:#181818;border-radius:10px;overflow:hidden;border-collapse:collapse">${standingsHtml}</table></div><div style="text-align:center;margin-top:20px"><a href="https://ffl-app-tau.vercel.app" style="background:#00d45a;color:#000;font-weight:800;text-transform:uppercase;letter-spacing:1px;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px">Voir mon pronostic →</a></div></div><div style="padding:16px;text-align:center;font-size:11px;color:#444;border-top:1px solid rgba(255,255,255,0.05)">Friends Farmers League · ffl-app-tau.vercel.app</div></div>`
          })
        });
      }
    }
    res.status(200).json({ success: true, message: 'Notifications sent!' });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
