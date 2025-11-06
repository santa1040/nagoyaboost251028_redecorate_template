import { GITHUB_TOKEN } from '$env/static/private';

export async function POST({ request }) {
  const { name, description = '', privateRepo = true, autoInit = true } = await request.json();

  const ghRes = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      name,
      description,
      private: privateRepo,
      auto_init: autoInit
    })
  });

  const data = await ghRes.json();
  return new Response(JSON.stringify(data), { status: ghRes.status });
}
