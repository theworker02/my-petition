-- LOCAL screenshot-only fixture. Never import into production.
INSERT OR IGNORE INTO users (id,email,display_name,password_hash,password_salt,is_guest) VALUES
('demo-user-1','demo1@invalid.example','Demo Participant 1','not-a-real-password-hash','demo-salt',1),
('demo-user-2','demo2@invalid.example','Demo Participant 2','not-a-real-password-hash','demo-salt',1),
('demo-user-3','demo3@invalid.example','Demo Participant 3','not-a-real-password-hash','demo-salt',1),
('demo-user-4','demo4@invalid.example','Demo Participant 4','not-a-real-password-hash','demo-salt',1),
('demo-user-5','demo5@invalid.example','Demo Participant 5','not-a-real-password-hash','demo-salt',1),
('demo-user-6','demo6@invalid.example','Demo Participant 6','not-a-real-password-hash','demo-salt',1),
('demo-user-7','demo7@invalid.example','Demo Participant 7','not-a-real-password-hash','demo-salt',1),
('demo-user-8','demo8@invalid.example','Demo Participant 8','not-a-real-password-hash','demo-salt',1),
('demo-user-9','demo9@invalid.example','Demo Participant 9','not-a-real-password-hash','demo-salt',1),
('demo-user-10','demo10@invalid.example','Demo Participant 10','not-a-real-password-hash','demo-salt',1),
('demo-user-11','demo11@invalid.example','Demo Participant 11','not-a-real-password-hash','demo-salt',1),
('demo-user-12','demo12@invalid.example','Demo Participant 12','not-a-real-password-hash','demo-salt',1);
INSERT OR IGNORE INTO proposals (id,slug,author_id,title,description,category,location,kind,author_name_override) VALUES ('demo-proposal-trees','more-street-trees-demo','demo-user-1','Should our community plant more trees along public streets?','Explore a community tree-planting program that could add shade, improve public spaces, and help residents discuss long-term maintenance and environmental priorities.','Environment','Community-wide','petition','Community Organizer');
INSERT OR IGNORE INTO proposals (id,slug,author_id,title,description,category,location,kind,author_name_override) VALUES ('demo-proposal-library','extended-library-hours-demo','demo-user-2','Should the public library offer extended weekend hours?','Consider whether additional Saturday and Sunday opening hours would help students, families, and working residents while balancing operating costs and staff availability.','Education','Local libraries','poll','Library Advocate');
INSERT OR IGNORE INTO proposals (id,slug,author_id,title,description,category,location,kind,author_name_override) VALUES ('demo-proposal-cycling','better-park-cycling-links-demo','demo-user-3','Should our town connect more public parks with safe cycling routes?','Share your perspective on making parks easier to reach by bike through better signage, connections, and street design, including potential costs and impacts on traffic.','Infrastructure','Town-wide','petition','Neighborhood Volunteer');
INSERT OR IGNORE INTO proposals (id,slug,author_id,title,description,category,location,kind,author_name_override) VALUES ('demo-proposal-data','public-service-data-demo','demo-user-4','Should local agencies publish more public service data online?','Discuss whether clear public dashboards for budgets, service requests, and infrastructure maintenance could improve access to information and accountability.','Technology','Online participation','poll','Civic Tech Group');
INSERT OR IGNORE INTO proposals (id,slug,author_id,title,description,category,location,kind,author_name_override) VALUES ('demo-proposal-benches','accessible-seating-demo','demo-user-5','Should parks add more accessible seating and rest areas?','Help evaluate whether additional benches and accessible rest spots in public parks could support visitors of different ages and abilities, and where improvements would matter most.','Community','Public parks','petition','Park Neighbor');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-trees','demo-user-1','support',1,'Example Participant 1');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-trees','demo-user-2','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-trees','demo-user-3','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-trees','demo-user-4','support',1,'Example Participant 4');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-trees','demo-user-5','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-trees','demo-user-6','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-trees','demo-user-7','oppose',1,'Example Participant 7');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-trees','demo-user-8','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-trees','demo-user-9','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-trees','demo-user-10','support',1,'Example Participant 10');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-library','demo-user-1','support',1,'Example Participant 1');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-library','demo-user-2','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-library','demo-user-3','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-library','demo-user-4','support',1,'Example Participant 4');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-library','demo-user-5','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-library','demo-user-6','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-library','demo-user-7','oppose',1,'Example Participant 7');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-library','demo-user-8','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-library','demo-user-9','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-library','demo-user-10','support',1,'Example Participant 10');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-cycling','demo-user-1','support',1,'Example Participant 1');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-cycling','demo-user-2','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-cycling','demo-user-3','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-cycling','demo-user-4','oppose',1,'Example Participant 4');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-cycling','demo-user-5','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-cycling','demo-user-6','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-cycling','demo-user-7','support',1,'Example Participant 7');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-cycling','demo-user-8','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-cycling','demo-user-9','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-cycling','demo-user-10','support',1,'Example Participant 10');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-data','demo-user-1','oppose',1,'Example Participant 1');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-data','demo-user-2','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-data','demo-user-3','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-data','demo-user-4','support',1,'Example Participant 4');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-data','demo-user-5','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-data','demo-user-6','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-data','demo-user-7','support',1,'Example Participant 7');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-data','demo-user-8','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-data','demo-user-9','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-data','demo-user-10','oppose',1,'Example Participant 10');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-benches','demo-user-1','oppose',1,'Example Participant 1');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-benches','demo-user-2','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-benches','demo-user-3','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-benches','demo-user-4','support',1,'Example Participant 4');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-benches','demo-user-5','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-benches','demo-user-6','support',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-benches','demo-user-7','support',1,'Example Participant 7');
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-benches','demo-user-8','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-benches','demo-user-9','oppose',0,NULL);
INSERT OR IGNORE INTO votes (proposal_id,user_id,stance,show_name,public_name) VALUES ('demo-proposal-benches','demo-user-10','oppose',1,'Example Participant 10');
INSERT OR IGNORE INTO comments(id,proposal_id,user_id,body,public_name) VALUES ('demo-comment-1','demo-proposal-trees','demo-user-8','Example discussion comment: consider long-term maintenance, watering, and which streets would benefit most.','Example Participant 8');
INSERT OR IGNORE INTO comments(id,proposal_id,user_id,body,public_name) VALUES ('demo-comment-2','demo-proposal-trees','demo-user-9','Example discussion comment: would funding and accessibility be part of the community plan?','Example Participant 9');
