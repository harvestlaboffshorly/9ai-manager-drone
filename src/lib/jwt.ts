// jwt.ts
import { createSecretKey } from "crypto";
import { JWTPayload, SignJWT, jwtVerify } from "jose";

// Load secret from env (base64-encoded)
const secretBase64 = process.env.JWT_SECRET_BASE64;
if (!secretBase64)
  throw new Error("Missing JWT_SECRET_BASE64 in environment variables.");

// Convert base64 -> KeyLike
const secretKey = createSecretKey(Buffer.from(secretBase64, "base64"));

const ISSUER = "9AIMASTER";
const AUDIENCE = "9AIDRONE";

/**
 * Signs a new JWT using HS256
 * @param payload - Custom claims to include in the JWT
 * @returns Signed JWT as string
 */
export async function signJwt(
  payload: Record<string, unknown>,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime("1h") // token expires in 1 hour
    .sign(secretKey);
}

/**
 * Verifies and decodes a JWT
 * @param token - JWT string from client or other service
 * @returns The decoded payload if valid, otherwise null
 */
export async function verifyJwt(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload;
  } catch (err) {
    console.error("JWT verification failed:", (err as Error).message);
    return null;
  }
}
