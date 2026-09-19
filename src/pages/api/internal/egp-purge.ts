export const prerender = false;

import { env } from 'cloudflare:workers';

/** One-shot secret for emptying EdgePress R2 buckets. Remove after purge. */
const PURGE_SECRET = '29V85P8COWH9GO5tXt0y-mCSu8B70O-6LAY-HuND21o';

type EgpEnv = typeof env & {
	EGP_PRO?: R2Bucket;
	EGP_FAR?: R2Bucket;
	EGP_RHA?: R2Bucket;
};

async function emptyBucket(bucket: R2Bucket | undefined, name: string) {
	if (!bucket) {
		return { name, ok: false, deleted: 0, error: 'binding missing' };
	}

	let deleted = 0;
	let cursor: string | undefined;

	for (;;) {
		const listed = await bucket.list({ cursor, limit: 1000 });
		if (listed.objects.length === 0) break;

		await Promise.all(listed.objects.map((obj) => bucket.delete(obj.key)));
		deleted += listed.objects.length;

		if (!listed.truncated) break;
		cursor = listed.cursor;
	}

	return { name, ok: true, deleted };
}

export async function POST({ request }: { request: Request }) {
	const auth = request.headers.get('authorization') ?? '';
	const expected = `Bearer ${PURGE_SECRET}`;
	if (auth !== expected) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}

	const e = env as EgpEnv;
	const results = await Promise.all([
		emptyBucket(e.EGP_PRO, 'pro-egp-r2'),
		emptyBucket(e.EGP_FAR, 'far-egp-r2'),
		emptyBucket(e.EGP_RHA, 'rha-egp-r2'),
	]);

	return Response.json({ ok: results.every((r) => r.ok), results });
}
