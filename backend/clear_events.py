import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'cctv_events.db')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute('DELETE FROM event_logs;')
conn.commit()
conn.close()
print('All events deleted from event_logs.')
