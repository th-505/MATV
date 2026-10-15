// Public client configuration only. Server secrets never belong in Flutter.
const mitvSupabaseUrl = String.fromEnvironment('MITV_SUPABASE_URL',
    defaultValue: 'https://roqccichwszxamdpvhli.supabase.co');
const mitvSupabasePublishableKey = String.fromEnvironment(
    'MITV_SUPABASE_PUBLISHABLE_KEY', defaultValue: 'sb_publishable_G8OJctDr8dYPV-5EzLoV7w_UQKYQAOq');
