# Build
FROM node:22-alpine AS build
WORKDIR /app
COPY docs-site/package.json docs-site/package-lock.json* ./
RUN npm ci || npm install
COPY docs-site/ ./
RUN npm run build

# Serve static files
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docs-site/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
