// backend/customer/middleware/auth.ts
// Authentication middleware for customer API

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Authenticate customer requests
 */
export function authenticateCustomer(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // For PoC, check for mock token
      if (authHeader === 'mock-jwt-token') {
        (req as any).user = {
          id: req.body.email || 'customer@example.com',
          email: req.body.email || 'customer@example.com',
          role: 'customer'
        };
        return next();
      }
      
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }
    
    const token = authHeader.substring(7);
    
    // In production, verify real JWT
    if (token === 'mock-jwt-token') {
      (req as any).user = {
        id: 'customer@example.com',
        email: 'customer@example.com',
        role: 'customer'
      };
      return next();
    }
    
    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    (req as any).user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role || 'customer'
    };
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  
  try {
    const token = authHeader.substring(7);
    
    // For PoC
    if (token === 'mock-jwt-token') {
      (req as any).user = {
        id: 'customer@example.com',
        email: 'customer@example.com',
        role: 'customer'
      };
    } else {
      // Verify JWT
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      (req as any).user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role || 'customer'
      };
    }
  } catch (error) {
    // Ignore errors for optional auth
  }
  
  next();
}

/**
 * Generate JWT token
 */
export function generateToken(user: {
  id: string;
  email: string;
  role?: string;
}): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role || 'customer'
    },
    JWT_SECRET,
    {
      expiresIn: '30d'
    }
  );
}

/**
 * Verify token without middleware
 */
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}