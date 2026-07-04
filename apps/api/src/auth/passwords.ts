import argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Lazily-computed argon2 hash of a throwaway password, memoized after first
// use, so a login for a NON-existent user still performs one real argon2
// verify and takes ~the same time as one for a real user — closing the
// response-timing side channel that would otherwise reveal valid usernames.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('argon2-timing-equalizer-not-a-real-secret');
  return dummyHashPromise;
}

export async function verifyPasswordOrDummy(hash: string | undefined, password: string): Promise<boolean> {
  const target = hash ?? (await getDummyHash());
  const matches = await verifyPassword(target, password);
  return hash ? matches : false;
}
