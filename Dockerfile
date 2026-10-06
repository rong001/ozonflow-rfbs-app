FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY js ./js
COPY css ./css
COPY extension ./extension
COPY design-system ./design-system
COPY docs ./docs
COPY index.html ./
COPY README.md DEPLOY.md AGENTS_SPEC.md AI_ARCHITECTURE.md SCENARIOS.md REQUIREMENTS_MAP.md ./
COPY .nojekyll ./
COPY ozonflow-connector.zip ./
RUN mkdir -p /data
ENV DATA_DIR=/data
ENV DOCKER=1
ENV PORT=8787
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "server/app.js"]
