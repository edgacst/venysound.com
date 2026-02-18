# -*- coding: utf-8 -*-
from flask import Flask, render_template
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, template_folder=os.path.join(BASE_DIR, 'templates'))

@app.route('/')
def home():
    return render_template('index.html')

if __name__ == '__main__':
    print('✅ 서버 시작: http://localhost:5001')
    app.run(debug=True, port=5001)
