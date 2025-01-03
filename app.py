from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///../db/database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
CORS(app)

class Recipe(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    calories = db.Column(db.Integer, nullable=False)
    meal_type = db.Column(db.String(20), nullable=False)

@app.route("/recipes", methods=["GET", "POST"])
def recipes():
    if request.method == "GET":
        recipes = Recipe.query.all()
        return jsonify([{"id": r.id, "name": r.name, "calories": r.calories, "meal_type": r.meal_type} for r in recipes])
    if request.method == "POST":
        data = request.json
        new_recipe = Recipe(name=data["name"], calories=data["calories"], meal_type=data["meal_type"])
        db.session.add(new_recipe)
        db.session.commit()
        return jsonify({"message": "Rezept hinzugefügt"}), 201

@app.route("/recipes/<int:id>", methods=["DELETE"])
def delete_recipe(id):
    recipe = Recipe.query.get(id)
    if recipe:
        db.session.delete(recipe)
        db.session.commit()
        return jsonify({"message": "Rezept gelöscht"})
    return jsonify({"message": "Rezept nicht gefunden"}), 404

if __name__ == "__main__":
    db.create_all()
    app.run(debug=True)
