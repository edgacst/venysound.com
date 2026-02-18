from flask import Flask, render_template
import os

app = Flask(__name__)

# templates 폴더 강제 지정
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')

print(f"Templates 폴더: {TEMPLATES_DIR}")
print(f"폴더 존재: {os.path.exists(TEMPLATES_DIR)}")

@app.route('/')
def home():
    try:
        return render_template('index.html')
    except Exception as e:
        return f"오류: {e}"

if __name__ == '__main__':
    print("서버 시작: http://localhost:5001")
    app.run(debug=True, port=5001)
