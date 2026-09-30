FROM node:20-bookworm-slim

WORKDIR /app

# Install root dependencies.
# The game engine currently resolves Rapier from the repository root.
COPY package.json package-lock.json ./
RUN npm ci

# Install the Next.js application's dependencies.
COPY ui_ux_research/design_c/package.json \
     ui_ux_research/design_c/package-lock.json \
     ./ui_ux_research/design_c/

RUN npm --prefix ui_ux_research/design_c ci

# Copy only the Iteration 1 game engine.
COPY src/game ./src/game

# Copy the Iteration 1 frontend.
COPY ui_ux_research/design_c ./ui_ux_research/design_c

WORKDIR /app/ui_ux_research/design_c

# Create the production Next.js build.
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]