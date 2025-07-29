// backend/customer/middleware/validation.ts
// Request validation middleware

import { Request, Response, NextFunction } from 'express';

interface ValidationRule {
  required?: boolean;
  requiredIf?: string;
  type?: 'string' | 'email' | 'date' | 'array';
  enum?: string[];
  maxLength?: number;
}

const validationRules: Record<string, Record<string, ValidationRule>> = {
  ownershipClaim: {
    productId: { required: true, type: 'string' },
    claimMethod: { required: true, enum: ['purchase', 'transfer', 'gift'] },
    purchaseReceipt: { requiredIf: 'claimMethod:purchase', type: 'string' },
    transferCode: { requiredIf: 'claimMethod:transfer', type: 'string' },
    location: { required: true, type: 'string' },
    timestamp: { required: true, type: 'date' }
  },
  
  transferRequest: {
    productId: { required: true, type: 'string' },
    reason: { required: true, enum: ['sale', 'gift', 'return', 'other'] },
    message: { type: 'string', maxLength: 500 }
  },
  
  reportProduct: {
    productId: { required: true, type: 'string' },
    type: { required: true, enum: ['stolen', 'lost'] },
    location: { type: 'string' },
    policeReport: { type: 'string' },
    description: { required: true, type: 'string', maxLength: 1000 }
  },
  
  recoveryRequest: {
    email: { required: true, type: 'email' },
    phone: { type: 'string' },
    productIds: { type: 'array' },
    verificationMethod: { 
      required: true, 
      enum: ['email', 'sms', 'id_upload'] 
    }
  }
};

/**
 * Validate request body against rules
 */
export function validateRequest(ruleName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const rules = validationRules[ruleName];
    
    if (!rules) {
      return next();
    }
    
    const errors: string[] = [];
    
    // Check each field
    for (const [field, rule] of Object.entries(rules)) {
      const value = req.body[field];
      
      // Check required
      if (rule.required && !value) {
        errors.push(`${field} is required`);
        continue;
      }
      
      // Check requiredIf
      if (rule.requiredIf) {
        const [condField, condValue] = rule.requiredIf.split(':');
        if (req.body[condField] === condValue && !value) {
          errors.push(`${field} is required when ${condField} is ${condValue}`);
          continue;
        }
      }
      
      // Skip if not provided and not required
      if (!value) continue;
      
      // Check type
      if (rule.type) {
        switch (rule.type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`${field} must be a string`);
            }
            break;
            
          case 'email':
            if (!isValidEmail(value)) {
              errors.push(`${field} must be a valid email`);
            }
            break;
            
          case 'date':
            if (!isValidDate(value)) {
              errors.push(`${field} must be a valid date`);
            }
            break;
            
          case 'array':
            if (!Array.isArray(value)) {
              errors.push(`${field} must be an array`);
            }
            break;
        }
      }
      
      // Check enum
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rule.enum.join(', ')}`);
      }
      
      // Check maxLength
      if (rule.maxLength && value.length > rule.maxLength) {
        errors.push(`${field} must not exceed ${rule.maxLength} characters`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors
      });
    }
    
    next();
  };
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate date format
 */
function isValidDate(date: any): boolean {
  if (date instanceof Date) return !isNaN(date.getTime());
  if (typeof date === 'string') {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }
  return false;
}

/**
 * Sanitize input
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  // Remove any potential XSS attempts
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query as any) as any;
  }
  
  next();
}

function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const cleaned: any = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Remove script tags and other dangerous content
      cleaned[key] = value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .trim();
    } else if (typeof value === 'object') {
      cleaned[key] = sanitizeObject(value);
    } else {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
}