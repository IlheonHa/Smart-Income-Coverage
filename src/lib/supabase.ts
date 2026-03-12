import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bowtbtlhufqwqsroqdxc.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_yeP1pwMer7aIH06-MCrXeA_8qqHwsBi';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
