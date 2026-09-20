-- Fix RLS on chat tables so messages persist across logout/login
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_channels_all" ON chat_channels;
CREATE POLICY "chat_channels_all" ON chat_channels FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_messages_all" ON chat_messages;
CREATE POLICY "chat_messages_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channel_members_all" ON channel_members;
CREATE POLICY "channel_members_all" ON channel_members FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for chat file attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-files', 'chat-files', true) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "chat_files_all" ON storage.objects;
CREATE POLICY "chat_files_all" ON storage.objects FOR ALL USING (bucket_id = 'chat-files') WITH CHECK (bucket_id = 'chat-files');
