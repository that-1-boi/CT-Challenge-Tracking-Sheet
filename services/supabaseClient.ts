import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

let supabase: SupabaseClient | null = null;

// Validate URL format
const isValidUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

if (supabaseUrl && supabaseAnonKey && isValidUrl(supabaseUrl)) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('Supabase client initialized successfully');
  } catch (error) {
    console.error('Failed to create Supabase client:', error);
  }
} else {
  const issues = [];
  if (!supabaseUrl) issues.push('VITE_SUPABASE_URL is missing');
  else if (!isValidUrl(supabaseUrl)) issues.push('VITE_SUPABASE_URL is not a valid URL');
  if (!supabaseAnonKey) issues.push('VITE_SUPABASE_ANON_KEY is missing');
  
  console.error(
    'Supabase not configured properly:',
    issues.join(', '),
    '\nPlease check your Vercel project settings:\n',
    '1. Go to your Vercel project → Settings → Environment Variables\n',
    '2. Add VITE_SUPABASE_URL with your Supabase project URL (e.g., https://xxxxx.supabase.co)\n',
    '3. Add VITE_SUPABASE_ANON_KEY with your Supabase anon key\n',
    '4. Make sure both are enabled for Production, Preview, and Development\n',
    '5. Redeploy your application'
  );
}

export { supabase };

