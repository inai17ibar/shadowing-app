-- ローカル開発用の教材（自社オリジナルの短文。本番には流さない）
--   npx wrangler d1 execute DB --local --file seeds/dev.sql
INSERT INTO materials (id, title, level, description, tags, source_name, source_url, license, sentences, status, published_at) VALUES
('dev-morning-routine', 'My Morning Routine', 'beginner', '朝の習慣についての短い独白。', '["daily-life"]',
 'Shadowing App (original)', '', 'original',
 '[{"text":"I wake up at six thirty every morning.","translation":"毎朝6時半に起きます。"},{"text":"First, I open the window and drink a glass of water.","translation":"まず窓を開けて、水を一杯飲みます。"},{"text":"Then I take a short walk around the park near my house.","translation":"それから家の近くの公園を少し散歩します。"},{"text":"When I get home, I make coffee and read the news.","translation":"家に帰るとコーヒーを入れてニュースを読みます。"},{"text":"It is a simple routine, but it helps me start the day calmly.","translation":"単純な習慣ですが、落ち着いて一日を始められます。"}]',
 'published', '2026-10-01T00:00:00.000Z'),
('dev-remote-work', 'Working From Home', 'intermediate', '在宅勤務の良い点と難しい点。', '["work"]',
 'Shadowing App (original)', '', 'original',
 '[{"text":"Working from home has become normal for many people over the past few years.","translation":"この数年で、在宅勤務は多くの人にとって当たり前になりました。"},{"text":"Without a long commute, you can use that extra time for exercise or family.","translation":"長い通勤がなければ、その時間を運動や家族に使えます。"},{"text":"On the other hand, it can be hard to separate your job from the rest of your life.","translation":"一方で、仕事と生活を切り分けるのが難しいこともあります。"},{"text":"Some people set a fixed time to close their laptop, even when they are busy.","translation":"忙しくても、パソコンを閉じる時刻を決めている人もいます。"}]',
 'published', '2026-10-02T00:00:00.000Z'),
('dev-attention', 'The Economics of Attention', 'advanced', '注意力という資源をめぐる小論。', '["essay"]',
 'Shadowing App (original)', '', 'original',
 '[{"text":"In an economy flooded with information, attention rather than content has become the scarce resource.","translation":"情報があふれる経済では、内容ではなく注意力こそが希少な資源になった。"},{"text":"Platforms compete not merely to inform us, but to keep us scrolling for as long as possible.","translation":"プラットフォームは情報を届けるためだけでなく、できるだけ長くスクロールさせるために競っている。"},{"text":"Reclaiming our focus, therefore, is less a matter of willpower than of deliberately designing our environment.","translation":"したがって集中を取り戻すのは、意志の力というより、環境を意図して設計する問題だ。"}]',
 'published', '2026-10-03T00:00:00.000Z');
