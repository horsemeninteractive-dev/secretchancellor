import { createClient } from '@supabase/supabase-js';

// Helper to get environment variables safely in both browser and node
const getEnv = (name: string) => {
  try {
    if (typeof window !== 'undefined') {
      // Browser (Vite)
      return (import.meta as any).env?.[`VITE_${name}`] || '';
    }
    // Node.js
    return process.env[name] || '';
  } catch (e) {
    return '';
  }
};

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null as any;
