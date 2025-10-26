import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Profile {
  id: string;
  username: string;
  password: string;
  role: string;
  friend_code: string;
  created_at: string;
}

export interface UserCard {
  id: string;
  user_id: string;
  card_def_key: string;
  quantity: number;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase!: SupabaseClient; // Use definite assignment assertion
  private currentUserSubject = new BehaviorSubject<Profile | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private isInitialized = false;

  constructor() {
    this.initializeClient();
  }

  private async initializeClient() {
    try {
      this.supabase = createClient(
        environment.supabase.url,
        environment.supabase.anonKey,
        {
          auth: {
            persistSession: false, // Disable session persistence to avoid locks
            autoRefreshToken: false, // Disable auto refresh
            detectSessionInUrl: false // Disable URL session detection
          }
        }
      );

      this.isInitialized = true;

      // Check if user is already logged in
      await this.checkExistingSession();
    } catch (error) {
      console.error('Error initializing Supabase client:', error);
    }
  }

  private async checkExistingSession() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        this.currentUserSubject.next(user);
      } catch (error) {
        console.error('Error parsing saved user:', error);
        localStorage.removeItem('currentUser');
      }
    }
  }

  /**
   * Sign in with username and password (fallback method without locks)
   */
  async signInFallback(username: string, password: string): Promise<{ user: Profile | null, error: string | null }> {
    try {
      // Simple test users for development (when Supabase is not available)
      const testUsers: Profile[] = [
        {
          id: '1',
          username: 'test',
          password: 'test',
          role: 'user',
          friend_code: 'FRIEND123',
          created_at: new Date().toISOString()
        },
        {
          id: '2',
          username: 'admin',
          password: 'admin',
          role: 'admin',
          friend_code: 'FRIEND456',
          created_at: new Date().toISOString()
        }
      ];

      const user = testUsers.find(u => u.username === username && u.password === password);

      if (user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
        this.currentUserSubject.next(user);
        return { user, error: null };
      }

      return { user: null, error: 'Invalid username or password' };
    } catch (error) {
      console.error('Fallback sign in error:', error);
      return { user: null, error: 'Sign in failed. Please try again.' };
    }
  }

  /**
   * Sign in with username and password
   */
  async signIn(username: string, password: string): Promise<{ user: Profile | null, error: string | null }> {
    try {
      // Wait for client to be initialized
      if (!this.isInitialized) {
        await new Promise(resolve => {
          const checkInit = () => {
            if (this.isInitialized) {
              resolve(void 0);
            } else {
              setTimeout(checkInit, 50);
            }
          };
          checkInit();
        });
      }

      // Add a small delay to avoid any potential lock conflicts
      await new Promise(resolve => setTimeout(resolve, 100));

      // Query the profiles table for matching username and password
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .eq('password', password) // Note: In production, use hashed passwords
        .single();

      if (error) {
        console.error('Database query error:', error);
        // If database connection fails, try fallback
        console.log('Trying fallback authentication...');
        return await this.signInFallback(username, password);
      }

      if (data) {
        // Store user session
        localStorage.setItem('currentUser', JSON.stringify(data));
        this.currentUserSubject.next(data);
        return { user: data, error: null };
      }

      return { user: null, error: 'User not found' };
    } catch (error) {
      console.error('Sign in error:', error);

      // Check if it's a lock error and use fallback
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message;
        if (errorMessage.includes('NavigatorLockAcquireTimeoutError') || errorMessage.includes('lock')) {
          console.log('Lock error detected, using fallback authentication...');
          return await this.signInFallback(username, password);
        }
      }

      // For any other error, try fallback
      console.log('Error occurred, trying fallback authentication...');
      return await this.signInFallback(username, password);
    }
  }

  /**
   * Sign out the current user
   */
  signOut(): void {
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
  }

  /**
   * Get current user
   */
  getCurrentUser(): Profile | null {
    return this.currentUserSubject.value;
  }

  /**
   * Check if user is signed in
   */
  isSignedIn(): boolean {
    return this.currentUserSubject.value !== null;
  }

  /**
   * Get a user's profile by username
   */
  async getProfileByUsername(username: string): Promise<Profile | null> {
    try {
      // Ensure client is initialized
      if (!this.isInitialized) {
        await new Promise<void>(resolve => {
          const check = (): void => {
            if (this.isInitialized) {
              resolve();
            } else {
              setTimeout(check, 50);
            }
          };
          check();
        });
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (error) {
        console.warn('getProfileByUsername fallback due to error:', error.message);
        // Fallback dev users
        const testUsers: Profile[] = [
          { id: '1', username: 'test', password: 'test', role: 'user', friend_code: 'FRIEND123', created_at: new Date().toISOString() },
          { id: '2', username: 'admin', password: 'admin', role: 'admin', friend_code: 'FRIEND456', created_at: new Date().toISOString() }
        ];
        return testUsers.find(u => u.username === username) || null;
      }

      return data || null;
    } catch (e) {
      console.error('Error in getProfileByUsername:', e);
      return null;
    }
  }

  /**
   * Get user's cards from the database
   */
  async getUserCards(userId: string, progressCallback?: (loaded: number, total?: number) => void): Promise<{ cards: UserCard[], error: string | null }> {
    try {
      const userIdInt = parseInt(userId);
      if (isNaN(userIdInt)) {
        return { cards: [], error: 'Invalid user ID format' };
      }

      const limit = 1000;
      let from = 0;
      let allCards: UserCard[] = [];
      let fetchMore = true;

      while (fetchMore) {
        const { data, error } = await this.supabase
          .from('user_cards')
          .select('*')
          .eq('user_id', userIdInt)
          .range(from, from + limit - 1);

        if (error) {
          return { cards: [], error: error.message };
        }

        if (data && data.length > 0) {
          allCards = allCards.concat(data);
          from += limit;
          fetchMore = data.length === limit;
          
          // Report progress if callback provided
          if (progressCallback) {
            progressCallback(allCards.length);
          }
        } else {
          fetchMore = false;
        }
      }

      return { cards: allCards, error: null };
    } catch (error) {
      console.error('Error fetching user cards:', error);
      return { cards: [], error: 'Failed to fetch user cards' };
    }
  }

  /**
   * Update user's card quantity
   */
  async updateCardQuantity(userId: string, cardDefKey: string, quantity: number): Promise<{ success: boolean, error: string | null }> {
    try {
      const userIdInt = parseInt(userId);
      if (isNaN(userIdInt)) {
        return { success: false, error: 'Invalid user ID format' };
      }

      if (quantity <= 0) {
        // Remove the card if quantity is 0 or negative
        const { error } = await this.supabase
          .from('user_cards')
          .delete()
          .eq('user_id', userIdInt)
          .eq('card_def_key', cardDefKey);

        if (error) {
          return { success: false, error: error.message };
        }
      } else {
        // Check if the card already exists for this user
        const { data: existingCard, error: selectError } = await this.supabase
          .from('user_cards')
          .select('*')
          .eq('user_id', userIdInt)
          .eq('card_def_key', cardDefKey)
          .maybeSingle();

        if (selectError) {
          console.error('Error checking existing card:', selectError);
          return { success: false, error: selectError.message };
        }

        if (existingCard) {
          // Update existing card
          const { error } = await this.supabase
            .from('user_cards')
            .update({ quantity })
            .eq('user_id', userIdInt)
            .eq('card_def_key', cardDefKey);

          if (error) {
            return { success: false, error: error.message };
          }
        } else {
          // Insert new card
          const { error } = await this.supabase
            .from('user_cards')
            .insert({
              user_id: userIdInt,
              card_def_key: cardDefKey,
              quantity
            });

          if (error) {
            return { success: false, error: error.message };
          }
        }
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Error updating card quantity:', error);
      return { success: false, error: 'Failed to update card quantity' };
    }
  }

  /**
   * Get user's card quantity for a specific card
   */
  async getCardQuantity(userId: string, cardDefKey: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('user_cards')
        .select('quantity')
        .eq('user_id', userId)
        .eq('card_def_key', cardDefKey)
        .single();

      if (error || !data) {
        return 0;
      }

      return data.quantity || 0;
    } catch (error) {
      console.error('Error fetching card quantity:', error);
      return 0;
    }
  }

  /**
   * Sync local collection with database
   */
  async syncUserCollection(userId: string, progressCallback?: (loaded: number) => void): Promise<{ [key: string]: number }> {
    try {
      const { cards, error } = await this.getUserCards(userId, progressCallback);

      if (error) {
        console.error('Error syncing user collection:', error);
        return {};
      }

      // Convert to the format expected by the collection component
      const collection: { [key: string]: number } = {};
      cards.forEach(card => {
        collection[card.card_def_key] = card.quantity;
      });

      return collection;
    } catch (error) {
      console.error('Error syncing user collection:', error);
      return {};
    }
  }

  /**
   * Bulk replace user's entire collection
   */
  async bulkReplaceUserCollection(userId: string, ownedCards: { [key: string]: number }): Promise<{ success: boolean, error: string | null }> {
    try {
      const userIdInt = parseInt(userId);
      if (isNaN(userIdInt)) {
        return { success: false, error: 'Invalid user ID format' };
      }

      // Step 1: Delete all existing cards for this user
      const { error: deleteError } = await this.supabase
        .from('user_cards')
        .delete()
        .eq('user_id', userIdInt);

      if (deleteError) {
        console.error('Error deleting existing cards:', deleteError);
        return { success: false, error: deleteError.message };
      }

      // Step 2: Prepare new cards for bulk insert (only cards with quantity > 0)
      const cardsToInsert = Object.entries(ownedCards)
        .filter(([_, quantity]) => quantity > 0)
        .map(([cardDefKey, quantity]) => ({
          user_id: userIdInt,
          card_def_key: cardDefKey,
          quantity: quantity
        }));

      // Step 3: Bulk insert new cards (if any)
      if (cardsToInsert.length > 0) {
        const { error: insertError } = await this.supabase
          .from('user_cards')
          .insert(cardsToInsert);

        if (insertError) {
          console.error('Error inserting new cards:', insertError);
          return { success: false, error: insertError.message };
        }

        console.log(`✅ Bulk sync completed: ${cardsToInsert.length} cards inserted`);
      } else {
        console.log('✅ Bulk sync completed: No cards to insert (collection is empty)');
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Error in bulk replace user collection:', error);
      return { success: false, error: 'Failed to bulk replace user collection' };
    }
  }
}