// Interface web de Shortly
const $ = (id) => document.getElementById(id);

// Petit utilitaire pour appeler l'API et remonter les erreurs
async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
}

function showResult(link) {
  $('short').href = link.shortUrl;
  $('short').textContent = link.shortUrl.replace(/^https?:\/\//, '');
  $('long').textContent = link.url;
  $('qr').src = `/api/links/${link.slug}/qr`;
  $('result').hidden = false;
}

async function loadLinks() {
  const links = await api('/api/links');
  $('empty').hidden = links.length > 0;
  $('links').innerHTML = '';
  for (const link of links) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="${link.shortUrl}" target="_blank" rel="noopener"></a></td>
      <td class="dest"></td>
      <td>${link.clicks}</td>
      <td class="actions"><button data-a="stats">Stats</button><button data-a="del">Supprimer</button></td>`;
    // textContent : on n'injecte jamais une URL fournie par l'utilisateur en HTML
    tr.querySelector('a').textContent = `/${link.slug}`;
    tr.querySelector('.dest').textContent = link.url;
    tr.querySelector('[data-a=stats]').onclick = () => showStats(link.slug);
    tr.querySelector('[data-a=del]').onclick = async () => {
      if (!window.confirm(`Supprimer /${link.slug} ?`)) return;
      await api(`/api/links/${link.slug}`, { method: 'DELETE' });
      $('stats').hidden = true;
      loadLinks();
    };
    $('links').appendChild(tr);
  }
}

// Graphique en barres des 7 derniers jours (sans librairie)
async function showStats(slug) {
  const s = await api(`/api/links/${slug}`);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ day: d, clicks: s.last7Days.find((x) => x.day === d)?.clicks || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.clicks));
  $('bars').innerHTML = days
    .map((d) => `<div class="bar"><span>${d.clicks}</span><div style="height:${(d.clicks / max) * 100}%"></div><span>${d.day.slice(8)}/${d.day.slice(5, 7)}</span></div>`)
    .join('');
  const sources = s.referrers.map((r) => `${r.source} (${r.clicks})`).join(', ') || 'aucune';
  $('stats-slug').textContent = `/${slug}`;
  $('stats-info').textContent = `${s.clicks} clics au total · sources : ${sources}${s.expiresAt ? ` · expire le ${s.expiresAt}` : ''}${s.expired ? ' · EXPIRÉ' : ''}`;
  $('stats').hidden = false;
  $('stats').scrollIntoView({ behavior: 'smooth' });
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error').hidden = true;
  try {
    const link = await api('/api/links', {
      method: 'POST',
      body: JSON.stringify({
        url: $('url').value,
        alias: $('alias').value.trim() || undefined,
        expiresInDays: $('expires').value || undefined,
      }),
    });
    showResult(link);
    $('form').reset();
    loadLinks();
  } catch (err) {
    $('error').textContent = err.message;
    $('error').hidden = false;
  }
});

$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('short').href);
  $('copy').textContent = 'Copié ✓';
  setTimeout(() => { $('copy').textContent = 'Copier'; }, 1500);
});

loadLinks();
