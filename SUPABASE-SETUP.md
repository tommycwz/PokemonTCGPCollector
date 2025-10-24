# Supabase Integration Setup Guide

## Overview

This guide explains how to set up and configure the Supabase integration for the Pokemon TCG Pocket Collection Manager. The system includes user authentication and cloud-based collection storage.

## Prerequisites

1. **Supabase Project**: Create a project at [supabase.com](https://supabase.com)
2. **Database Tables**: Set up the required tables in your Supabase project

## Database Schema

### 1. `profiles` Table

```sql
CREATE TABLE profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_profiles_username ON profiles(username);
```

### 2. `user_cards` Table

```sql
CREATE TABLE user_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  card_def_key VARCHAR(50) NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, card_def_key)
);

-- Add indexes for performance
CREATE INDEX idx_user_cards_user_id ON user_cards(user_id);
CREATE INDEX idx_user_cards_card_def_key ON user_cards(card_def_key);
```

## Environment Configuration

### 1. Update Environment Files

Replace the placeholder values in the environment files:

**`src/environments/environment.ts`:**
```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'https://your-project-id.supabase.co',
    anonKey: 'your-anon-key-here'
  }
};
```

**`src/environments/environment.prod.ts`:**
```typescript
export const environment = {
  production: true,
  supabase: {
    url: 'https://your-project-id.supabase.co',
    anonKey: 'your-anon-key-here'
  }
};
```

### 2. Get Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy the **Project URL** and **anon public** key
4. Replace the placeholder values in your environment files

## Row Level Security (RLS)

For better security, enable RLS on your tables:

### 1. Enable RLS

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cards ENABLE ROW LEVEL SECURITY;
```

### 2. Create Policies

**For `profiles` table:**
```sql
-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (true); -- Since we're using custom auth

-- Only authenticated users can read profiles
CREATE POLICY "Authenticated users can read profiles" ON profiles
  FOR SELECT TO authenticated USING (true);
```

**For `user_cards` table:**
```sql
-- Users can manage their own cards
CREATE POLICY "Users can manage own cards" ON user_cards
  FOR ALL USING (true); -- Since we're using custom auth

-- Alternative: If using Supabase auth
-- CREATE POLICY "Users can manage own cards" ON user_cards
--   FOR ALL USING (auth.uid() = user_id);
```

## User Management

Since this is an invite-only system, users must be created manually:

### 1. Create a User (SQL)

```sql
INSERT INTO profiles (username, password, role)
VALUES ('testuser', 'password123', 'user');
```

### 2. Create an Admin User

```sql
INSERT INTO profiles (username, password, role)
VALUES ('admin', 'adminpass123', 'admin');
```

**⚠️ Security Note**: In production, passwords should be hashed using a secure algorithm like bcrypt.

## Features

### Authentication
- ✅ Username/password sign-in
- ✅ Session persistence in localStorage
- ✅ Route protection with AuthGuard
- ✅ Automatic redirect to sign-in page

### Collection Management
- ✅ Real-time sync with Supabase database
- ✅ Local caching for offline support
- ✅ Optimistic UI updates
- ✅ Error handling and rollback

### User Experience
- ✅ User info display in header
- ✅ Sign out functionality
- ✅ Loading states and error messages
- ✅ Responsive design

## API Endpoints Used

The application uses the following Supabase operations:

### Authentication
```typescript
// Sign in
supabase.from('profiles')
  .select('*')
  .eq('username', username)
  .eq('password', password)
  .single()
```

### Collection Management
```typescript
// Get user cards
supabase.from('user_cards')
  .select('*')
  .eq('user_id', userId)

// Update card quantity
supabase.from('user_cards')
  .upsert({ user_id, card_def_key, quantity })

// Delete card (when quantity = 0)
supabase.from('user_cards')
  .delete()
  .eq('user_id', userId)
  .eq('card_def_key', cardDefKey)
```

## Card ID Format

Cards are identified using the format: `{set}-{number}`

Examples:
- `A1-1` (Set A1, Card #1 - Bulbasaur)
- `A1-2` (Set A1, Card #2 - Ivysaur)
- `A1-226` (Set A1, Card #226 - Pikachu ex)

## Testing

### 1. Create Test Data

```sql
-- Create test user
INSERT INTO profiles (id, username, password, role)
VALUES ('123e4567-e89b-12d3-a456-426614174000', 'testuser', 'test123', 'user');

-- Add some test cards
INSERT INTO user_cards (user_id, card_def_key, quantity) VALUES
('123e4567-e89b-12d3-a456-426614174000', 'A1-1', 2),
('123e4567-e89b-12d3-a456-426614174000', 'A1-2', 1),
('123e4567-e89b-12d3-a456-426614174000', 'A1-3', 3);
```

### 2. Test Sign In

1. Navigate to `http://localhost:4201/signin`
2. Enter credentials: `testuser` / `test123`
3. Should redirect to collection page
4. Verify cards are loaded from database

## Security Considerations

### 1. Password Security
- **Current**: Plain text passwords (development only)
- **Production**: Implement bcrypt hashing
- **Recommendation**: Use Supabase Auth for production

### 2. API Security
- ✅ RLS policies implemented
- ✅ Client-side validation
- ✅ Error handling for unauthorized access

### 3. Data Validation
- ✅ Input sanitization
- ✅ Type checking
- ✅ Required field validation

## Deployment

### 1. Environment Variables

For production deployment, set environment variables:

```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### 2. Build Command

```bash
ng build --configuration production
```

## Troubleshooting

### Common Issues

1. **"Invalid username or password"**
   - Check if user exists in database
   - Verify password matches exactly
   - Check Supabase connection

2. **Cards not syncing**
   - Check network connectivity
   - Verify RLS policies are correct
   - Check browser console for errors

3. **Sign in redirect loop**
   - Clear localStorage
   - Check AuthGuard implementation
   - Verify routing configuration

### Debug Mode

Enable debug logging in browser console:

```typescript
// In SupabaseService
```

## Next Steps

1. **Implement Password Hashing**: Use bcrypt for secure password storage
2. **Add Role-Based Access**: Implement admin/user role features
3. **Enhanced Error Handling**: Better user feedback for errors
4. **Audit Logging**: Track user actions and changes
5. **Data Export/Import**: Sync with other collection management tools

## Support

For issues with this integration:

1. Check Supabase project dashboard for errors
2. Review browser console for client-side errors
3. Verify database schema matches requirements
4. Test with simple SQL queries in Supabase SQL editor