const SUPABASE_URL = "https://auykdsmpfkljassfavba.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1eWtkc21wZmtsamFzc2ZhdmJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDY3MDQsImV4cCI6MjA5NjcyMjcwNH0.RDyHifIK1IbmmNi_vqP3nqFwIQG3F7sI0Df2VjZrzTM";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storage: window.sessionStorage,   // 탭 단위 유지: 같은 탭에서 앱 간 이동 시 로그인 유지, 탭/브라우저 닫으면 로그아웃
    autoRefreshToken: true,
    detectSessionInUrl: false,
    lock: (name, acquireTimeout, fn) => fn()
  }
});
