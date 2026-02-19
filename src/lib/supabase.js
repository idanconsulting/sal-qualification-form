import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://oirehnrecwzcvxusdbku.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pcmVobnJlY3d6Y3Z4dXNkYmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0OTYzMTQsImV4cCI6MjA4NzA3MjMxNH0.yS8tUFbv0c0fw4P-rIEebC_am3QHW6XrrXfaOvZ13sY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
