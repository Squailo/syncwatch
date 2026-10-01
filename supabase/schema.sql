-- ============================================
-- SyncWatch — Schema de Supabase con Subtítulos
-- ============================================
-- Ejecuta este SQL en: Supabase Dashboard → SQL Editor → New Query

-- Tabla de salas
CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  password TEXT NOT NULL,
  video_url TEXT NOT NULL,
  subtitles_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Si ya creaste la tabla antes, corre esta línea para agregar la columna de subtítulos:
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS subtitles_url TEXT;

-- Habilitar Row Level Security
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Permitir lectura anónima (necesario para verificar contraseña desde el cliente)
DROP POLICY IF EXISTS "Allow anonymous read" ON rooms;
CREATE POLICY "Allow anonymous read" ON rooms
  FOR SELECT
  USING (true);

-- ============================================
-- INSTRUCCIONES PARA SUBTÍTULOS (.SRT):
-- ============================================
-- 1. Sube tu archivo .srt al bucket "videos" en Supabase Storage (asegúrate de que el bucket sea Public)
-- 2. Copia la URL pública del archivo .srt
-- 3. Actualiza tu sala con este SQL:
--
-- UPDATE rooms 
-- SET subtitles_url = 'https://TU-PROYECTO.supabase.co/storage/v1/object/public/videos/subtitulos.srt'
-- WHERE password = 'tu_contraseña';
