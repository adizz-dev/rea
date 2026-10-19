# DevOps Lab Answers (Corrected)

---

# Session 1 — DevOps Engineer Roadmap

## Lab 1 — CI/CD workflow

**Question:** Given a sample application scenario, draw a simple CI/CD workflow from code commit to deployment. Label the build, test, package, deploy, and monitoring stages.

```text
Developer
   |
   v
Git commit / Pull Request
   |
   v
Build --> Automated tests --> Security checks
   |              |                  |
   +--------------+------------------+
                  |
                  v
         Package (Docker image)
                  |
                  v
       Push to container registry
                  |
                  v
       Deploy to staging / production
                  |
                  v
       Monitor logs, metrics, alerts
                  |
                  +---- feedback to developers
```

## Lab 2 — Monolith vs Microservices

**Question:** Compare a monolithic application and a microservices application for a provided online shopping use case. Identify two operational benefits and two challenges of microservices.

| Area | Monolithic application | Microservices |
|---|---|---|
| Deployment | Deployed as one unit | Each service deployed independently |
| Scaling | Scale the whole application | Scale only the busy service |
| Operations benefit | Simpler initial deployment and debugging | Independent scaling and releases |
| Challenge | A small change needs full rebuild/redeploy | More networking, monitoring, distributed debugging |
| Challenge | One process can become a bottleneck | Service discovery, API compatibility, data consistency |

## Lab 3 — One-page DevOps roadmap

**Question:** Create a one-page DevOps roadmap for a small team that currently deploys manually. Prioritize version control, automated tests, containerization, CI/CD, and monitoring, with a short reason for each.

```markdown
# DevOps Roadmap

1. Version control — use Git, branches, and pull requests so changes are tracked and reviewable.
2. Automated tests — run unit/integration tests before merging to catch regressions early.
3. Containerization — create a Dockerfile so the app runs consistently across developer and deployment environments.
4. CI/CD — automate build, test, package, and deployment steps to reduce manual errors and release effort.
5. Monitoring — collect logs, metrics, and alerts so failures and performance problems are detected quickly.
```

---

# Session 2 — Linux

## Lab 1 — Directories and file operations

**Question:** Create a project directory with app, logs, and config subdirectories. Create sample files and demonstrate listing, copying, moving, searching, and deleting files.

```bash
mkdir -p project/{app,logs,config}
touch project/app/main.py project/logs/app.log project/config/app.conf
echo "example=value" > project/config/app.conf
find project -maxdepth 2 -type f
ls -la project/app
cp project/config/app.conf project/config/app.conf.bak
mv project/config/app.conf.bak project/config/backup.conf
grep -R "example" project
rm project/config/backup.conf
```

## Lab 2 — User, group, permissions

**Question:** Create a user named examuser and a group named devops. Add the user to the group and configure suitable ownership and permissions on a project directory.

```bash
sudo groupadd devops
sudo useradd -m examuser
sudo usermod -aG devops examuser
sudo mkdir -p /srv/devops-project
sudo chown -R root:devops /srv/devops-project
sudo chmod 2775 /srv/devops-project
id examuser
ls -ld /srv/devops-project
```

## Lab 3 — Inspect a service and diagnose a problem

**Question:** Check the status of a Linux service, inspect its logs, and document the commands used to diagnose a simulated service problem.

```bash
systemctl status nginx --no-pager
sudo journalctl -u nginx --since "30 minutes ago" --no-pager
sudo nginx -t
sudo ss -lntp
```

---

# Session 3 — Shell Scripting

## Lab 1 — Count files and subdirectories

**Question:** Write a shell script that accepts a directory path as an argument and displays the number of files and subdirectories. Handle a missing or invalid argument.

```bash
cat > count-items.sh <<'EOF'
#!/usr/bin/env bash
set -u
if [[ $# -ne 1 || ! -d "$1" ]]; then
  echo "Usage: $0 DIRECTORY" >&2
  exit 1
fi
dir=$1
files=$(find "$dir" -maxdepth 1 -type f | wc -l)
dirs=$(find "$dir" -mindepth 1 -maxdepth 1 -type d | wc -l)
printf 'Files: %s\nDirectories: %s\n' "$files" "$dirs"
EOF
chmod +x count-items.sh
./count-items.sh .
./count-items.sh /path/that/does/not/exist
```

## Lab 2 — Check file permissions

**Question:** Write a script that checks whether a supplied file exists and is readable, writable, and executable. Print a clear result for each check.

```bash
cat > check-file.sh <<'EOF'
#!/usr/bin/env bash
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 FILE" >&2
  exit 1
fi
f=$1
if [[ ! -e "$f" ]]; then
  echo "File does not exist: $f"
  exit 1
fi
[[ -r "$f" ]] && echo "Readable: yes" || echo "Readable: no"
[[ -w "$f" ]] && echo "Writable: yes" || echo "Writable: no"
[[ -x "$f" ]] && echo "Executable: yes" || echo "Executable: no"
EOF
chmod +x check-file.sh
./check-file.sh check-file.sh
```

## Lab 3 — System-health script

**Question:** Write a reusable system-health script using variables, conditions, loops, and functions. Report disk usage, memory, and uptime.

```bash
cat > system-health.sh <<'EOF'
#!/usr/bin/env bash
set -u
show_disk() { df -h /; }
show_memory() {
  if command -v free >/dev/null 2>&1; then free -h
  else echo "free command not available"; fi
}
show_uptime() { uptime; }
for check in disk memory uptime; do
  echo "===== $check ====="
  case "$check" in
    disk) show_disk ;;
    memory) show_memory ;;
    uptime) show_uptime ;;
  esac
done
EOF
chmod +x system-health.sh
./system-health.sh
```

---

# Session 4 — Networking

## Lab 1 — IP, subnet, route, listening ports

**Question:** Use Linux commands to display the machine IP address, subnet information, default route, and listening ports. Include the command and a brief interpretation for each.

```bash
# Interface addresses and CIDR prefixes (for example, 192.168.1.20/24)
ip -br address

# Routing table; the line beginning with "default" is the default route
ip route

# Shows the route and source address the machine would use to reach this destination
ip route get 1.1.1.1

# Listening TCP/UDP sockets, numeric ports, and owning processes (where permitted)
sudo ss -lntup
```

Interpretation: `ip -br address` shows assigned IP addresses and subnet prefixes; `ip route` shows the default gateway and connected routes; `ip route get` shows the selected outbound route; `ss -lntup` lists listening ports and, with sufficient permissions, the owning process.

## Lab 2 — Troubleshoot a web service

**Question:** Use ping, ss, and curl to troubleshoot a web service. Determine whether a simulated failure is caused by reachability, a closed port, or an HTTP response.

```bash
# 1. Check basic local IP-stack reachability
ping -c 4 127.0.0.1

# 2. Check whether a TCP service is listening on the expected port
ss -lnt | grep ':8080'

# 3. Inspect connection and HTTP response details
curl -v --max-time 5 http://localhost:8080/
```

Interpretation:
- Ping failure can indicate a local networking problem, but successful ping does not prove the web service works.
- If no process is listening on port 8080, check the service/container and its port mapping.
- `Connection refused` usually means the destination is reachable but nothing is accepting the connection on that port.
- An HTTP status such as `404` or `500` means an HTTP server responded; investigate the URL, application route, or server logs. A timeout can indicate a hung service, firewall, or routing issue.

## Lab 3 — Resolve a domain, check HTTP/HTTPS

**Question:** Resolve a domain using nslookup or dig, then use curl to verify HTTP/HTTPS connectivity. Record the DNS result and HTTP status.

```bash
nslookup example.com
dig example.com
curl -I -L --max-time 10 https://example.com
curl -I -L --max-time 10 http://example.com
```

Record the DNS answer returned by `nslookup` or `dig` (for example, an `A` or `AAAA` address). In the `curl -I` output, record the final HTTP status line, such as `HTTP/2 200` or a redirect status. `-L` follows redirects, so the last status line is usually the final response. HTTP sites may redirect to HTTPS; a successful DNS lookup alone does not prove HTTP connectivity.

---

# Session 5 — Git & GitHub

## Lab 1 — Repository, three commits, push

**Question:** Create a Git repository for a small application, add a README, make at least three meaningful commits, and push it to GitHub.

```bash
mkdir devops-git-lab && cd devops-git-lab
git init -b main
echo "# DevOps Git Lab" > README.md
git add README.md && git commit -m "docs: add README"
mkdir app
echo 'echo "Hello DevOps"' > app/run.sh
git add app/run.sh && git commit -m "feat: add sample script"
chmod +x app/run.sh
echo "Run with ./app/run.sh" >> README.md
git add README.md app/run.sh && git commit -m "docs: explain how to run app"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/devops-git-lab.git
git push -u origin main
```

## Lab 2 — Feature branch and Pull Request

**Question:** Create a feature branch, implement a change, push the branch, and merge it into main through a Pull Request after reviewing the diff.

```bash
git switch -c feature/update-readme
echo "Feature branch example" >> README.md
git diff
git add README.md
git commit -m "docs: update README on feature branch"
git push -u origin feature/update-readme
# Open PR on GitHub (feature/update-readme -> main) and merge it
git switch main
git pull origin main
git log --oneline --graph --decorate -8
```

## Lab 3 — Merge conflict

**Question:** Create a merge conflict by editing the same line on two branches. Resolve it, commit the resolution, and verify the final history.

```bash
git switch main
echo "mode=main" > settings.txt
git add settings.txt && git commit -m "chore: add settings"
git switch -c feature/settings
echo "mode=feature" > settings.txt
git commit -am "feat: change settings on feature branch"
git switch main
echo "mode=production" > settings.txt
git commit -am "chore: change settings on main"
git merge feature/settings
# conflict reported -> resolve:
cat > settings.txt <<'EOF'
mode=production
EOF
git add settings.txt
git commit -m "fix: resolve settings merge conflict"
git status
git log --oneline --graph --decorate -8
```

---

# Sessions 6–7 — Docker

## Lab 1 — Run Nginx

**Question:** Run an Nginx container with host port 8080 mapped to container port 80. Verify access using curl and inspect the container logs.

```bash
docker run -d --name nginx-lab -p 8080:80 nginx
curl http://localhost:8080
docker logs nginx-lab
```

## Lab 2 — Build image for HTML page

**Question:** Create a Dockerfile for a simple HTML page using FROM, WORKDIR, COPY, and CMD. Build the image, run it, and verify the page.

```bash
mkdir -p docker-lab && cd docker-lab
echo '<h1>Hello Docker</h1>' > index.html
cat > Dockerfile <<'EOF'
FROM nginx
WORKDIR /usr/share/nginx/html
COPY index.html .
CMD ["nginx", "-g", "daemon off;"]
EOF
docker build -t html-lab .
docker run -d --name html-container -p 8081:80 html-lab
curl http://localhost:8081
```

## Lab 3 — `.dockerignore` and environment variable

**Question:** Add a .dockerignore file and an environment variable to the Docker build. Rebuild and run the image, then explain the purpose of each added instruction.

```bash
cd docker-lab
printf 'secret.txt\ntemporary/\n' > .dockerignore
echo "do not include this file in the build context" > secret.txt
mkdir -p temporary
echo "temporary file" > temporary/temp.txt

cat > Dockerfile <<'EOF'
FROM nginx
ARG BUILD_ENV=dev
WORKDIR /usr/share/nginx/html
COPY index.html .
ENV APP_ENV=production
ENV BUILD_ENV=${BUILD_ENV}
CMD ["nginx", "-g", "daemon off;"]
EOF

docker build --build-arg BUILD_ENV=prod -t html-lab .
docker run -d --name html-container-2 -p 8082:80 html-lab
docker exec html-container-2 printenv APP_ENV
docker exec html-container-2 printenv BUILD_ENV
curl http://localhost:8082
```

Explanation: `.dockerignore` excludes `secret.txt` and `temporary/` from the build context; `ARG BUILD_ENV` accepts a build-time value; `ENV` sets environment variables available to the running container. Do not use Docker build arguments or image environment variables to store real secrets.

---

# Session 8 — Docker Networking & Volumes

## Lab 1 — Network and name-based communication

**Question:** Create a custom Docker network and run two containers on it. Demonstrate name-based communication between the containers.

```bash
docker network create lab-net
docker run -d --name web-lab --network lab-net nginx
sleep 3
docker run --rm --network lab-net busybox:1.36 nslookup web-lab
docker run --rm --network lab-net busybox:1.36 wget -qO- http://web-lab
```

## Lab 2 — Named volume persistence

**Question:** Run a database container with a named volume, create sample data, remove and recreate the container, and verify that the data persists.

```bash
docker volume create db-lab-data
docker run -d --name db-lab \
  -e POSTGRES_PASSWORD=labpass \
  -e POSTGRES_DB=labdb \
  -v db-lab-data:/var/lib/postgresql/data \
  postgres:16
until docker exec db-lab pg_isready -U postgres -d labdb; do sleep 2; done
docker exec db-lab psql -U postgres -d labdb -c \
  "CREATE TABLE IF NOT EXISTS notes (id SERIAL PRIMARY KEY, note TEXT);"
docker exec db-lab psql -U postgres -d labdb -c \
  "INSERT INTO notes(note) VALUES ('persistent data');"
docker rm -f db-lab
docker run -d --name db-lab \
  -e POSTGRES_PASSWORD=labpass \
  -e POSTGRES_DB=labdb \
  -v db-lab-data:/var/lib/postgresql/data \
  postgres:16
until docker exec db-lab pg_isready -U postgres -d labdb; do sleep 2; done
docker exec db-lab psql -U postgres -d labdb -c "SELECT * FROM notes;"
```

## Lab 3 — Compose web app and database

**Question:** Write a compose.yaml file for a web application and database. Start the stack, verify service communication, inspect logs, and shut it down.

This example starts a web server and a database on the same Compose network. Nginx itself does **not** connect to PostgreSQL. The `psql` check runs inside the running `db` container and verifies a local database query; it does not test database access from a separate client container or application-level web-to-database integration.

`compose.yaml`:

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "8083:80"
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: appdb
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: local-lab-password
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 5s
      timeout: 3s
      retries: 10
    volumes:
      - dbdata:/var/lib/postgresql/data
volumes:
  dbdata:
```

```bash
docker compose up -d
docker compose ps
docker compose logs
docker compose exec db pg_isready -U appuser -d appdb
docker compose exec db psql -U appuser -d appdb -c 'SELECT 1;'
curl -I http://localhost:8083
docker compose down
```

Compose places services on a shared network, so an application container can reach PostgreSQL by the hostname `db` and its default port `5432`. For a true application-level test, the `web` service must be an application configured to use `db:5432`; stock Nginx does not do this. `docker compose down` preserves the named volume; add `-v` only when intentionally deleting the database data.

---

# Session 9 — Kubernetes

## Lab 1 — Inspect cluster resources

**Question:** Connect to a Kubernetes cluster and inspect nodes, namespaces, and cluster resources using kubectl. Record what each command shows.

```bash
kubectl cluster-info
kubectl get nodes -o wide
kubectl get namespaces
kubectl get pods -A
kubectl get deployments -A
kubectl get services -A
```

- `kubectl cluster-info` reports the Kubernetes control-plane/service endpoints.
- `kubectl get nodes -o wide` lists nodes, readiness, roles, versions, IPs, and runtime details.
- `kubectl get namespaces` lists namespaces used to separate cluster resources.
- `kubectl get pods -A` lists Pods across all namespaces and their status.
- `kubectl get deployments -A` lists Deployments and desired/available replicas.
- `kubectl get services -A` lists Services, types, cluster IPs, and exposed ports.

## Lab 2 — Deploy and inspect a web application

**Question:** Deploy a simple web application and inspect it using kubectl get, describe, and logs. Confirm that the workload reaches a healthy state.

```bash
kubectl create deployment web-lab --image=nginx
kubectl rollout status deployment/web-lab
kubectl get pods -o wide
kubectl describe deployment web-lab
POD_NAME=$(kubectl get pods -l app=web-lab -o jsonpath='{.items[0].metadata.name}')
kubectl describe pod "$POD_NAME"
kubectl logs "$POD_NAME"
kubectl expose deployment web-lab --port=80 --type=ClusterIP
kubectl get service web-lab
```

## Lab 3 — Kubernetes architecture roles

**Question:** Identify the role of the API Server, Scheduler, Controller Manager, etcd, kubelet, and kubectl in a short cluster architecture diagram.

```text
kubectl (client)
    |
    v
API Server <----> etcd (cluster state)
    |
    +--> Scheduler (assigns Pods to nodes)
    |
    +--> Controller Manager (reconciles desired state)

Worker node:
  kubelet (ensures assigned Pods are running)
  container runtime (runs containers)
```

---

# Session 10 — Kubernetes Core Objects

## Lab 1 — Nginx Pod

**Question:** Create a Pod running Nginx and inspect its status, labels, IP address, and logs using kubectl.

```bash
kubectl run nginx-pod --image=nginx --labels="app=nginx-lab"
kubectl wait --for=condition=Ready pod/nginx-pod --timeout=120s
kubectl get pod nginx-pod --show-labels -o wide
kubectl describe pod nginx-pod
kubectl logs nginx-pod
```

## Lab 2 — Scale Deployment 2 → 5 → 2

**Question:** Create a Deployment with two replicas, scale it to five, and then scale it back to two. Verify the replica count at each step.

```bash
kubectl create deployment scale-lab --image=nginx --replicas=2
kubectl rollout status deployment/scale-lab
kubectl get deployment scale-lab
kubectl scale deployment/scale-lab --replicas=5
kubectl rollout status deployment/scale-lab
kubectl get deployment scale-lab
kubectl scale deployment/scale-lab --replicas=2
kubectl rollout status deployment/scale-lab
kubectl get deployment scale-lab
```

## Lab 3 — Rolling update and rollback

**Question:** Deploy version 1 of an application, perform a rolling update to version 2, verify the rollout, and roll back to version 1.

```bash
kubectl create deployment rollout-lab --image=nginx:1.25
kubectl rollout status deployment/rollout-lab
kubectl set image deployment/rollout-lab nginx=nginx:1.26
kubectl rollout status deployment/rollout-lab
kubectl rollout history deployment/rollout-lab
kubectl rollout undo deployment/rollout-lab
kubectl rollout status deployment/rollout-lab
kubectl get deployment rollout-lab -o wide
```

---

# Session 11 — Kubernetes Services

## Lab 1 — ClusterIP Service and endpoints

**Question:** Deploy an application with multiple replicas and create a ClusterIP Service that selects the correct Pods. Verify its endpoints.

```bash
kubectl create deployment svc-lab --image=nginx --replicas=3
kubectl expose deployment svc-lab --name=svc-lab --port=80 --target-port=80 --type=ClusterIP
kubectl rollout status deployment/svc-lab
kubectl get pods --show-labels
kubectl get service svc-lab
kubectl get endpoints svc-lab
kubectl get endpointslices -l kubernetes.io/service-name=svc-lab
kubectl describe service svc-lab
```

## Lab 2 — NodePort Service

**Question:** Create a NodePort Service and demonstrate access to the application through the exposed node port.

```bash
kubectl create deployment nodeport-lab --image=nginx
kubectl expose deployment nodeport-lab --type=NodePort --port=80 --target-port=80
kubectl get service nodeport-lab
kubectl get nodes -o wide
minikube service nodeport-lab --url
```

## Lab 3 — Service port differs from targetPort

**Question:** Configure a Service whose port and targetPort differ. Verify that traffic reaches the intended container port.

```bash
kubectl create deployment port-lab --image=nginx
kubectl expose deployment port-lab --name=port-lab --type=ClusterIP --port=8080 --target-port=80
kubectl get service port-lab
kubectl describe service port-lab
kubectl get endpoints port-lab
kubectl run curl-test --image=curlimages/curl:8.10.1 --restart=Never --rm -it -- \
  curl -I http://port-lab:8080
```

---

# Session 12 — Ingress, ConfigMaps & Secrets

## Lab 1 — Ingress

**Question:** Deploy an application and configure an Ingress rule that routes requests by host or URL path to the correct Service.

```bash
minikube addons enable ingress
kubectl create deployment ingress-web --image=nginx
kubectl expose deployment ingress-web --name=ingress-web --port=80
```

`ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-web
spec:
  ingressClassName: nginx
  rules:
    - host: web.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ingress-web
                port:
                  number: 80
```

```bash
kubectl apply -f ingress.yaml
kubectl rollout status deployment/ingress-web
kubectl get ingress
kubectl describe ingress ingress-web
kubectl get ingress ingress-web -o wide
kubectl get pods -n ingress-nginx
```

Use the address shown by `kubectl get ingress ingress-web -o wide` if one is assigned. On some Minikube setups, obtain the controller's address with `minikube ip` or use `minikube tunnel` as required by the environment. Replace `INGRESS_IP` below with the reachable address; it is a placeholder, not a literal value.

```bash
curl -H 'Host: web.local' http://INGRESS_IP/
```

## Lab 2 — ConfigMap environment variables

**Question:** Create a ConfigMap and inject its values into a Deployment as environment variables. Verify the values inside a running Pod.

```bash
kubectl create configmap app-config \
  --from-literal=APP_ENV=production \
  --from-literal=LOG_LEVEL=INFO
```

`configmap-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: configmap-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: configmap-demo
  template:
    metadata:
      labels:
        app: configmap-demo
    spec:
      containers:
        - name: app
          image: busybox:1.36
          command: ["sh", "-c", "env; sleep 3600"]
          envFrom:
            - configMapRef:
                name: app-config
```

```bash
kubectl apply -f configmap-deployment.yaml
kubectl rollout status deployment/configmap-demo
POD_NAME=$(kubectl get pods -l app=configmap-demo -o jsonpath='{.items[0].metadata.name}')
kubectl exec "$POD_NAME" -- printenv APP_ENV
kubectl exec "$POD_NAME" -- printenv LOG_LEVEL
```

## Lab 3 — Secret consumed by a Pod

**Question:** Create a Kubernetes Secret for a sample credential and consume it from a Pod without hard-coding the credential in the Deployment manifest.

```bash
read -s -p "Enter lab password: " LAB_PASSWORD; echo
kubectl create secret generic db-credentials --from-literal=password="$LAB_PASSWORD"
unset LAB_PASSWORD
```

`secret-pod.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-pod
spec:
  containers:
    - name: demo
      image: busybox:1.36
      command: ["sh", "-c", "test -n \"$DB_PASSWORD\" && echo 'Secret is present'; sleep 3600"]
      env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
```

```bash
kubectl apply -f secret-pod.yaml
kubectl wait --for=condition=Ready pod/secret-pod --timeout=90s
kubectl logs secret-pod
```

---

# Session 13 — Storage, HPA & Probes

## Lab 1 — PVC persistence

**Question:** Create a PersistentVolumeClaim, mount it into a Pod, write a file, recreate the Pod, and verify that the file remains.

`pvc-lab.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: lab-pvc
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: storage-lab
spec:
  containers:
    - name: writer
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: lab-pvc
```

```bash
kubectl apply -f pvc-lab.yaml
kubectl get pvc
kubectl wait --for=condition=Ready pod/storage-lab --timeout=120s
kubectl exec storage-lab -- sh -c 'echo persistent > /data/test.txt'
kubectl delete pod storage-lab
kubectl apply -f pvc-lab.yaml
kubectl wait --for=condition=Ready pod/storage-lab --timeout=120s
kubectl exec storage-lab -- cat /data/test.txt
```

## Lab 2 — Readiness and liveness probes

**Question:** Configure readiness and liveness probes for a sample application. Demonstrate how Kubernetes reacts when the application is not ready or becomes unhealthy.

`probes.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: probes-lab
spec:
  replicas: 1
  selector:
    matchLabels:
      app: probes-lab
  template:
    metadata:
      labels:
        app: probes-lab
    spec:
      containers:
        - name: web
          image: nginx
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 10
            periodSeconds: 10
```

```bash
kubectl apply -f probes.yaml
kubectl rollout status deployment/probes-lab
kubectl describe pod -l app=probes-lab
kubectl get pods

# Demonstrate readiness: scale the Deployment to zero, then back up.
# While there are no replicas, there are no Ready Pods/endpoints.
kubectl scale deployment/probes-lab --replicas=0
kubectl get pods
kubectl scale deployment/probes-lab --replicas=1
kubectl rollout status deployment/probes-lab

# Demonstrate a liveness failure safely in a separate test Deployment:
kubectl create deployment liveness-demo --image=busybox:1.36 -- /bin/sh -c 'sleep 3600'
kubectl patch deployment liveness-demo --type=json -p='[{"op":"add","path":"/spec/template/spec/containers/0/livenessProbe","value":{"exec":{"command":["sh","-c","exit 1"]},"initialDelaySeconds":5,"periodSeconds":5,"failureThreshold":1}}]'
kubectl rollout status deployment/liveness-demo
kubectl get pods -l app=liveness-demo
kubectl describe pod -l app=liveness-demo
# Clean up the intentionally unhealthy demonstration workload.
kubectl delete deployment liveness-demo
```

Readiness removes a Pod from Service endpoints while it is not ready; liveness failures cause kubelet to restart the container after the configured failure threshold.

## Lab 3 — HPA

**Question:** Configure an HPA for a Deployment with CPU requests defined. Generate load and observe replica scaling; document any cluster prerequisites.

Prerequisites: the cluster must have a working Metrics Server/metrics API, and the Deployment must define CPU requests for its containers. On Minikube, enable Metrics Server if it is not already available (`minikube addons enable metrics-server`).

```bash
kubectl create deployment hpa-lab --image=registry.k8s.io/hpa-example
kubectl set resources deployment hpa-lab --requests=cpu=100m
kubectl expose deployment hpa-lab --port=80
kubectl rollout status deployment/hpa-lab
kubectl autoscale deployment hpa-lab --cpu-percent=50 --min=1 --max=5
kubectl get hpa
kubectl top pods
```

Load generator (separate terminal):

```bash
kubectl run load-generator --image=busybox:1.36 --restart=Never -- \
  sh -c 'while true; do wget -q -O- http://hpa-lab; done'
```

```bash
kubectl get hpa -w
kubectl get deployment hpa-lab
kubectl delete pod load-generator
```

---

# Session 14 — Kubernetes Troubleshooting

## Lab 1 — ImagePullBackOff

**Question:** Deploy a workload with an invalid image. Diagnose ImagePullBackOff using kubectl get, describe, and events, then correct the image.

```bash
kubectl create deployment bad-image --image=nginx:tag-that-does-not-exist
kubectl get pods
kubectl describe pod -l app=bad-image
kubectl get events --sort-by=.lastTimestamp
kubectl set image deployment/bad-image nginx=nginx
kubectl rollout status deployment/bad-image
kubectl get pods
```

## Lab 2 — CrashLoopBackOff

**Question:** Diagnose a CrashLoopBackOff workload using logs and describe. Identify the root cause, fix the configuration, and verify recovery.

```bash
kubectl create deployment crash-lab --image=busybox:1.36 -- /bin/sh -c 'exit 1'
kubectl get pods
kubectl describe pod -l app=crash-lab
kubectl logs deployment/crash-lab --previous
kubectl patch deployment crash-lab --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/command","value":["sh","-c","sleep 3600"]}]'
kubectl rollout status deployment/crash-lab
kubectl get pods
```

## Lab 3 — Incorrect Service selector

**Question:** Create a Service with an incorrect selector. Use labels, selectors, endpoints, and Service configuration to identify and fix the issue.

```bash
kubectl create deployment selector-lab --image=nginx --replicas=2
kubectl expose deployment selector-lab --name=selector-svc --port=80 --target-port=80
kubectl patch service selector-svc --type=merge -p '{"spec":{"selector":{"app":"wrong-label"}}}'
kubectl get pods --show-labels
kubectl describe service selector-svc
kubectl get endpoints selector-svc
kubectl patch service selector-svc --type=merge -p '{"spec":{"selector":{"app":"selector-lab"}}}'
kubectl get endpoints selector-svc
kubectl describe service selector-svc
```

---

# Session 15 — Helm

## Lab 1 — Create a chart

**Question:** Create a Helm chart for a simple web application. Explain the purpose of Chart.yaml, values.yaml, and the templates directory.

```bash
helm create web-chart
find web-chart -maxdepth 2 -type f
cat web-chart/Chart.yaml
cat web-chart/values.yaml
```

- `Chart.yaml` contains chart metadata such as the chart name and version.
- `values.yaml` supplies default configurable values such as replica count, image, and Service settings.
- `templates/` contains Kubernetes manifests rendered using the chart templates and values. `helm template web-demo web-chart` renders these manifests locally without installing the release.

## Lab 2 — Image, replicas, Service port

**Question:** Deploy the chart with configurable image, replica count, and Service port values. Verify the rendered and installed Kubernetes resources.

`web-chart/values.yaml` (relevant values):

```yaml
replicaCount: 2
image:
  repository: nginx
  tag: "1.26"
service:
  type: ClusterIP
  port: 8080
```

```bash
helm lint web-chart
helm template web-demo web-chart
helm install web-demo web-chart \
  --set replicaCount=2 \
  --set image.repository=nginx \
  --set image.tag=1.26 \
  --set service.port=8080
helm status web-demo
kubectl get deployments,services,pods
```

## Lab 3 — Upgrade, history, rollback

**Question:** Upgrade a Helm release, inspect its revision history, and roll back to the previous revision. Verify the final release status.

```bash
helm upgrade web-demo web-chart --set replicaCount=3
helm history web-demo
helm status web-demo
helm rollback web-demo 1
helm status web-demo
helm history web-demo
kubectl get deployment
```

---

# Session 16 — GitHub Actions

## Lab 1 — Workflow on push

**Question:** Create a GitHub Actions workflow triggered on push that checks out the repository, installs dependencies, and builds the application.

Example for a Node.js application that has `package.json` and a lockfile. Save as `.github/workflows/build.yml`.

```yaml
name: Build and test
on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Build application
        run: npm run build --if-present
```

## Lab 2 — Automated tests (pass/fail)

**Question:** Add an automated test step. Demonstrate that a failing test causes the workflow to fail and that a corrected test passes.

Add these steps to a Python project's workflow job (or use a separate Python job). A non-zero exit code from `pytest` makes the job and workflow fail.

```yaml
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          if [ -f requirements.txt ]; then python -m pip install -r requirements.txt; fi
          python -m pip install pytest
      - name: Run tests
        run: pytest
```

To demonstrate the gate, run the workflow once with a deliberately failing assertion and observe the failed test step. Correct the assertion, push the fix, and confirm the next run passes. Do not leave a deliberately failing test in the final branch.

## Lab 3 — Upload build artifact

**Question:** Extend the workflow to upload a build artifact and make it downloadable from the Actions run.

Add these steps after the build step in the same workflow job. Replace `dist/` with the real build output directory if the project uses a different one.

```yaml
      - name: Create sample build output
        run: |
          mkdir -p dist
          echo "build output" > dist/build.txt
      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: application-build
          path: dist/
          if-no-files-found: error
          retention-days: 7
```

Open the completed Actions run and download `application-build` from the run's **Artifacts** section.

---

# Session 17 — DevSecOps

## Lab 1 — Build and push image using secrets

**Question:** Create a CI/CD pipeline that builds a Docker image and pushes it to a container registry using repository secrets rather than hard-coded credentials.

```yaml
name: Container CI
on:
  push:
    branches: [main]
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: YOUR_DOCKERHUB_USERNAME/YOUR_IMAGE:latest
```

## Lab 2 — SAST, dependency scan, secret scan, and gate

**Question:** Add SAST, dependency scanning, and secret scanning to a pipeline. Configure a required security check to block later stages when it fails.

This example is for a JavaScript repository with a lockfile. Each security check runs as a separate job. The `deploy` job depends on all three checks, so it is skipped if any check fails. Configure the corresponding status checks as required in GitHub branch protection/rulesets if merges must also be blocked.

```yaml
name: Security checks
on: [push, pull_request]

permissions:
  contents: read
  security-events: write

jobs:
  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript
      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3

  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Audit npm dependencies
        run: npm audit --audit-level=high

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  deploy:
    needs: [sast, dependency-audit, secret-scan]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deployment gate
        run: echo "All security checks passed; deployment may proceed."
      # Add the real deployment action/command here.
```

## Lab 3 — Scan image and gate deployment

**Question:** Add container image vulnerability scanning and implement a gate that prevents deployment when the agreed severity threshold is exceeded.

Place these steps in a workflow after the image has been built and pushed. The scan exits with code `1` when it finds a fixable CRITICAL or HIGH vulnerability, causing the job to fail. The deployment job depends on the scan and therefore will not run after a failed scan.

```yaml
name: Image security gate
on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  build-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - name: Build and push image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: YOUR_DOCKERHUB_USERNAME/YOUR_IMAGE:${{ github.sha }}
      - name: Scan image for vulnerabilities
        uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: YOUR_DOCKERHUB_USERNAME/YOUR_IMAGE:${{ github.sha }}
          format: table
          exit-code: "1"
          ignore-unfixed: true
          vuln-type: os,library
          severity: CRITICAL,HIGH

  deploy:
    needs: build-scan
    runs-on: ubuntu-latest
    steps:
      - name: Deployment gate
        run: echo "Scan passed; add the real deployment command here."
```

Replace the image placeholders and deployment step with the project's actual registry and deployment configuration.

---

# Session 18 — Terraform & IaC

## Lab 1 — Provider and resource

**Question:** Write Terraform configuration that declares a provider and creates a small supported resource. Run fmt, init, validate, and plan, then explain the output.

`main.tf`:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

resource "aws_s3_bucket" "lab" {
  bucket_prefix = "devops-lab-"
}
```

```bash
terraform fmt
terraform init
terraform validate
terraform plan
```

`fmt` formats the configuration; `init` downloads the provider and initializes the working directory; `validate` checks configuration syntax and internal consistency; `plan` previews proposed changes without applying them. The plan may show that Terraform intends to create an S3 bucket. A successful plan does not create the bucket.

## Lab 2 — Variables, tfvars, outputs

**Question:** Use variables and outputs in a Terraform configuration. Pass a variable through a .tfvars file and print a useful output after apply.

`variables.tf`:

```hcl
variable "aws_region" {
  description = "AWS region for the lab"
  type        = string
  default     = "ap-south-1"
}

variable "bucket_prefix" {
  description = "Prefix for the lab bucket"
  type        = string
  default     = "devops-practice-"
}
```

`main.tf`:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_s3_bucket" "lab" {
  bucket_prefix = var.bucket_prefix
}

output "bucket_name" {
  value = aws_s3_bucket.lab.bucket
}
```

`terraform.tfvars`:

```hcl
aws_region    = "ap-south-1"
bucket_prefix = "devops-practice-"
```

```bash
terraform fmt
terraform init
terraform validate
terraform plan
terraform apply
terraform output bucket_name
```

## Lab 3 — Resource change and state

**Question:** Modify a resource configuration, inspect the plan before applying, and explain how Terraform state maps configuration to real infrastructure. Do not commit secrets or state files.

```hcl
resource "aws_s3_bucket" "lab" {
  bucket_prefix = var.bucket_prefix
  tags = {
    Environment = "lab"
    ManagedBy   = "Terraform"
  }
}
```

```bash
terraform fmt
terraform validate
terraform plan
terraform state list
terraform state show aws_s3_bucket.lab
```

Terraform state records the mapping between resource addresses in configuration (such as `aws_s3_bucket.lab`) and the real infrastructure objects Terraform manages. Review the plan before applying a change. State can contain sensitive values: do not commit state files or credentials to Git; use an appropriate remote backend and access controls for shared work.

---

# Session 19 — Cloud & Terraform

## Lab 1 — Cloud network design

**Question:** Design a cloud network with a VPC/VNet, public and private subnets, route tables, and security rules. Submit a diagram and explain the traffic flow.

```text
Internet
   |
Internet Gateway
   |
VPC: 10.0.0.0/16
   |
Public subnet: 10.0.1.0/24
   |-- Route table: 0.0.0.0/0 -> Internet Gateway
   |-- Internet-facing load balancer / optional bastion
   |-- NAT Gateway (with Elastic IP)
   |
Private app subnet: 10.0.2.0/24
   |-- Route table: 0.0.0.0/0 -> NAT Gateway
   |-- Application instances; no public IPs
   |
Private data subnet: 10.0.3.0/24
      Route table: local VPC route only
      Database; no public IP
```

Traffic flow: internet clients reach the public load balancer through the Internet Gateway. The load balancer forwards allowed application traffic to the private app tier. App instances use the NAT Gateway for outbound internet access such as updates; the NAT Gateway does not allow unsolicited inbound connections to the private instances. The database accepts traffic only from the app tier on its required database port. Security groups should allow only those required flows, and administrative access should be restricted to an approved private path or client CIDR.

## Lab 2 — Provision network and compute

**Question:** Use Terraform to provision a small cloud network and one low-cost compute resource in a sandbox account. Run plan before apply and destroy the lab resources afterward.

Example for an AWS sandbox. This creates a VPC, a public subnet, an Internet Gateway, a public route, a security group that permits HTTP only, and one small EC2 instance. It intentionally does not open SSH to the internet. The AMI is selected dynamically for Amazon Linux 2023 in `ap-south-1`.

`main.tf`:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_vpc" "lab" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = { Name = "devops-lab-vpc" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.lab.id
  cidr_block              = "10.20.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true
  tags = { Name = "devops-lab-public" }
}

resource "aws_internet_gateway" "lab" {
  vpc_id = aws_vpc.lab.id
  tags = { Name = "devops-lab-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.lab.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.lab.id
  }
  tags = { Name = "devops-lab-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "app" {
  name        = "devops-lab-http"
  description = "Allow HTTP only"
  vpc_id      = aws_vpc.lab.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "lab" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = "t3.micro"
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.app.id]
  associate_public_ip_address = true
  user_data = <<-EOF
    #!/bin/bash
    dnf install -y nginx
    systemctl enable --now nginx
  EOF
  tags = { Name = "devops-lab-instance" }
}

output "instance_public_ip" {
  value = aws_instance.lab.public_ip
}
```

Run the plan and inspect it before creating resources:

```bash
terraform fmt
terraform init
terraform validate
terraform plan -out=tfplan
terraform show tfplan
terraform apply tfplan
terraform output instance_public_ip
# When finished, destroy resources to avoid ongoing charges:
terraform destroy
```

This is a lab example, not a production network. Confirm sandbox permissions and pricing before applying.

## Lab 3 — Restrict firewall access

**Question:** Configure a security group/firewall rule that permits only the required application port. Demonstrate that SSH/admin access is not open to the entire internet.

This is a complete standalone security-group example. Supply the actual VPC ID and the client CIDR that should be allowed to reach the application. Do not use `0.0.0.0/0` for SSH or administrative access.

`main.tf`:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

variable "vpc_id" {
  description = "Existing VPC ID for the application"
  type        = string
}

variable "allowed_client_cidr" {
  description = "Client CIDR allowed to reach HTTP, for example your approved public IP followed by /32"
  type        = string
}

resource "aws_security_group" "app" {
  name        = "devops-lab-app"
  description = "Allow required application traffic only"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "app_http" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = var.allowed_client_cidr
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  description       = "HTTP from approved client CIDR"
}

output "application_security_group_id" {
  value = aws_security_group.app.id
}
```

`terraform.tfvars` (replace the example values with real values):

```hcl
vpc_id              = "vpc-0123456789abcdef0"
allowed_client_cidr = "203.0.113.10/32"
```

```bash
terraform fmt
terraform init
terraform validate
terraform plan
```

No SSH ingress rule is defined, so this configuration does not expose TCP port 22. The example CIDR `203.0.113.10/32` is documentation-only and must be replaced with an approved client IP/CIDR before use.

---

# Session 20 — Monitoring, Observability & GitOps

## Lab 1 — Metrics and Prometheus

**Question:** Expose application metrics and configure Prometheus to scrape them. Verify the target is healthy and identify at least two metrics.

The application must expose a Prometheus-format `/metrics` endpoint before Prometheus can scrape it. Replace the host and port with the actual address reachable **from the Prometheus process/container**.

```bash
curl -i http://APPLICATION_HOST:PORT/metrics
```

Add this job under the existing `scrape_configs` section in `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: "sample-app"
    metrics_path: /metrics
    static_configs:
      - targets: ["APPLICATION_HOST:PORT"]
```

Validate/reload Prometheus using the method supported by your environment, then open **Status → Targets**. The target should be `UP`; open it to inspect the last scrape error if it is not. In the metrics response, identify at least two actual metric names (for example, request count and request duration if the application exports them). The endpoint and metric names are application-specific; do not assume they exist without checking.

## Lab 2 — Grafana dashboard

**Question:** Create a Grafana dashboard with panels for request rate, errors, and latency, or use the metrics available in the supplied environment. Explain what each panel indicates.

Create three panels in Grafana, select the Prometheus data source, paste the matching query into each panel, and choose a time-series visualization. Metric names and labels must match those actually exported by your application; adjust them if necessary.

```promql
# Panel 1 — Requests per second
sum(rate(http_requests_total[5m]))

# Panel 2 — Server error responses per second (5xx)
sum(rate(http_requests_total{status=~"5.."}[5m]))

# Panel 3 — 95th percentile request latency, in seconds
histogram_quantile(
  0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)
```

Interpretation: request rate shows traffic volume; the 5xx panel shows the rate of server-side errors; p95 latency shows the response time below which 95% of observed requests fall. If your application does not export these metric names/labels, use the equivalent metrics that are available in the supplied environment. Save the dashboard after creating the panels.

## Lab 3 — GitOps with Argo CD

**Question:** Configure a basic GitOps deployment using Argo CD or a supplied GitOps environment. Change the desired replica count in Git and verify reconciliation in the cluster.

Keep `deployment.yaml` in the repository path Argo CD will watch:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gitops-nginx
spec:
  replicas: 2
  selector:
    matchLabels:
      app: gitops-nginx
  template:
    metadata:
      labels:
        app: gitops-nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.26
          ports:
            - containerPort: 80
```

Commit and push the initial desired state, then create the Argo CD application:

```bash
git add deployment.yaml
git commit -m "add gitops-nginx"
git push

argocd app create APP_NAME \
  --repo https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO.git \
  --path . \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace default \
  --sync-policy automated

argocd app get APP_NAME
kubectl get deployment gitops-nginx
```

Now edit `deployment.yaml` in Git and change `replicas: 2` to `replicas: 3`, then commit and push:

```bash
git add deployment.yaml
git commit -m "scale to 3 replicas"
git push

# Wait for automated reconciliation; inspect status and replica count
argocd app get APP_NAME
kubectl rollout status deployment/gitops-nginx
kubectl get deployment gitops-nginx
kubectl get pods -l app=gitops-nginx
```

With automated sync enabled, Argo CD should reconcile the cluster to the Git-declared count. `argocd app sync APP_NAME` is an optional manual sync, not necessary to demonstrate automated GitOps. The repository URL, app name, and repo path must be replaced with the real values.


---

## Verification notes

- Replace every placeholder such as `YOUR_GITHUB_USERNAME`, `YOUR_IMAGE`, `APP_NAME`, `APPLICATION_HOST`, `PORT`, `INGRESS_IP`, `vpc-...`, and example CIDRs with values from your own environment before running commands.
- These labs assume the relevant tools are installed and authenticated. Kubernetes examples require a working cluster; Ingress/HPA labs also require their respective controllers/metrics components.
- Terraform `apply` and cloud resources can incur charges. Review `terraform plan` before applying, and destroy disposable lab infrastructure when finished.
- Never commit credentials, Terraform state files, or real secrets to Git. The PostgreSQL password in the Compose example is a lab-only placeholder and should not be used in production.
