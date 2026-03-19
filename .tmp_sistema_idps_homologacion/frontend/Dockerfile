FROM node:20-alpine

WORKDIR /app

# Instalar dependencias
COPY package.json package-lock.json* ./
RUN npm install

# Copiar código
COPY . .

# Puerto expuesto
EXPOSE 3000

# Comando por defecto
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
