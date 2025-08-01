// backend/auth/auth-routes.ts
import express, { Router, Request, Response } from 'express';
import { AuthService } from './auth-service';

export function createAuthRoutes(authService: AuthService): Router {
  const router = express.Router();

  /**
   * Login endpoint
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      const result = await authService.login(email, password);

      if (!result) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      res.json({
        success: true,
        user: result.user,
        token: result.token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * Verify token endpoint
   */
  router.get('/verify', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'No token provided'
        });
      }

      const token = authHeader.substring(7);
      const decoded = authService.verifyToken(token);

      if (!decoded) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
      }

      // Get fresh user data
      const user = authService.getUserById(decoded.id);
      
      res.json({
        success: true,
        user,
        token
      });
    } catch (error) {
      console.error('Token verification error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * Get current user
   */
  router.get('/me', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const token = authHeader.substring(7);
      const decoded = authService.verifyToken(token);

      if (!decoded) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
      }

      const user = authService.getUserById(decoded.id);
      
      res.json({
        success: true,
        user
      });
    } catch (error) {
      console.error('Get current user error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * Get demo credentials (for development)
   */
  router.get('/demo-credentials', (req: Request, res: Response) => {
    res.json({
      success: true,
      credentials: AuthService.getDemoCredentials(),
      note: 'These are demo credentials for local development. In production, use proper authentication.'
    });
  });

  /**
   * Logout (client-side, but we can use this for logging)
   */
  router.post('/logout', (req: Request, res: Response) => {
    // In a real app, you might invalidate the token here
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });

  return router;
}