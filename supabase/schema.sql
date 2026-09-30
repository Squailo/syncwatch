-- ============================================
-- SyncWatch — Schema de Supabase
-- ============================================
-- Ejecuta este SQL en: Supabase Dashboard → SQL Editor → New Query

-- Tabla de salas
CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  password TEXT NOT NULL,
  video_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Permitir lectura anónima (necesario para verificar contraseña desde el cliente)
CREATE POLICY "Allow anonymous read" ON rooms
  FOR SELECT
  USING (true);

-- ============================================
-- INSTRUCCIONES:
-- ============================================
-- 1. Ejecuta este SQL en Supabase
-- 2. Ve a Storage → Create new bucket → nombre: "videos" → Public bucket: ON
-- 3. Sube tu archivo .mov al bucket "videos"
-- 4. Copia la URL pública del video
-- 5. Inserta tu sala con este SQL (cambia los valores):
--
-- INSERT INTO rooms (password, video_url)
-- VALUES (
--   'tu_contraseña_aqui',
--   'https://TU-PROYECTO.supabase.co/storage/v1/object/public/videos/tu-video.mov'
-- );
