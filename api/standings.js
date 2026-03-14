module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const response = await fetch(
      'https://api.football-data.org/v4/competitions/FL1/standings',
      { headers: { 'X-Auth-Token': process.env.FOOTBALL_API_KEY } }
    );
    const data = await response.json();
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
