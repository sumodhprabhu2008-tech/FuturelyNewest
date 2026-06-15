import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: number
}

// Defined independently — JwtPayload types sub as string, but we sign with a numeric userId
interface AccessTokenPayload {
  sub: number
  iat: number
  exp: number
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  // Dev bypass already injected userId — skip JWT verification
  if (req.userId !== undefined) {
    next()
    return
  }

  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Missing token' },
    })
    return
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as unknown as AccessTokenPayload
    req.userId = payload.sub
    next()
  } catch {
    res.status(401).json({
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
    })
  }
}
