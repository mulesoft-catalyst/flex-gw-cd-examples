# Kubernetes Ingress Controller

This example shows how a Continuous Delivery solution can be implemented for a Flex Gateway instance installed as a Kubernetes ingress controller, in local mode. In this mode, Flex Gateway is mostly disconnected from the Anypoint control plane and is managed with declarative configuration files.

![K8S Ingress Controller deployment architecture](img/deploy_arch_k8s_ingress.png)

This example uses [ArgoCD](https://argo-cd.readthedocs.io/en/stable/), a declarative, GitOps continuous delivery tool for Kubernetes. Configuration file(s) which describe the *desired state* of the target cluster are stored within a GitHub repository. ArgoCD polls the repository in order to detect when the desired state has changed and applies changes to the target cluster in order to ensure that its *actual state* matches the desired state.

**Note: the steps below are correct at time of writing, based on a beta version of Flex Gateway. Please refer to the Flex Gateway documentation for up-to-date instructions on installing and configuring Flex Gateway.**

## Pre-requisites

1. A tool to create Kubernetes clusters. This example was developed using [k3d](https://k3d.io/).
2. [kubectl](https://kubernetes.io/docs/tasks/tools/#kubectl), a tool used to interact with Kubernetes clusters.
3. [Helm](https://helm.sh/docs/intro/install/), a tool used to install Flex Gateway. Version 3.0.0 or later is required.

## Prepare and Install Flex Gateway

1. Create a new Kubernetes cluster with a single server node:
```
k3d cluster create flex-gateway-1 \
--k3s-arg "--disable=traefik@server:*" \
--port '80:80@server:*' \
--port '443:443@server:*'
```
2. Download the Flex Gateway container image:
```
curl -o flex-gateway-1.0.0-beta.15.tar \
https://peregrine:48bcfd4617c9cce@d8wbbsqfcfi8u.cloudfront.net/docker/flex-gateway-1.0.0-beta.15.tar
```
3. Import the Flex Gateway container image:
```
k3d image import -c flex-gateway-1 flex-gateway-1.0.0-beta.15.tar
```
4. Add the Flex Gateway Helm repository:
```
helm repo add flex-gateway https://flex-packages.stgx.anypoint.mulesoft.com/helm
```
5. Update the Helm repository using the following command:
```
helm repo up
```
6. Using Ingress, install the flex-gateway Helm chart into the gateway namespace:
```
helm -n gateway upgrade -i --wait --create-namespace ingress flex-gateway/flex-gateway
```
7. Verify **apiinstances** were created during installation:
```
kubectl -n gateway get apiinstances
```
The command returns output similar to the following:
```
NAME            ADDRESS
ingress-http    http://0.0.0.0:80
ingress-https   http://0.0.0.0:443
```

## Install ArgoCD

For simplicity, ArgoCD is installed in the same cluster as Flex Gateway in this example. It is accessed from outside of the cluster using port forwarding. In practice, you may wish to install ArgoCD in a separate cluster, expose it using an ingress controller such as NGINX and use it to manage one or more Flex Gateway clusters.

**Note: the steps below are correct at time of writing, based on the [ArgoCD Getting Started docs](https://argo-cd.readthedocs.io/en/stable/getting_started/). Please refer to these docs for up-to-date instructions on installing ArgoCD.**

1. Install ArgoCD into a new namespace called `argocd`
```
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```
2. Download and install the ArgoCD CLI. The method of installation varies depending on your operating system. Refer to the [CLI installation docs](https://argo-cd.readthedocs.io/en/stable/cli_installation/) for more detailed instructions. If you have Homebrew, it can be installed as shown:
```
brew install argocd
```
3. To access the ArgoCD API Server, use `kubectl` port-forwarding. Open a separate CLI window and run:
```
kubectl port-forward svc/argocd-server -n argocd 8080:443
```
4. Log in using the CLI. The initial password for the `admin` account is auto-generated and can be retrieved using this command:
```
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```
Using the userame `admin` and the password from above, log in to ArgoCD:
```
argocd login localhost:8080
```
5. Change the password for the `admin` user using this command:
```
argocd account update-password
```
 
## Create a source code repository
The `k8s-ingress-controller` directory within this repository contains example YAML configuration files which describe the *desired state* of the Flex Gateway cluster we created above. We will create a new application in ArgoCD, which will use these files to configure the cluster. Before we can do this, we need to create a source code repository which the ArgoCD application will connect to. In this example, we **fork** this GitHub repo, then configure ArgoCD to connect to it. ArgoCD can be configured to connect to other Git-based SCMs too - please refer to the docs if needed. 

To fork this repo and configure your fork, follow these steps:
1. Navigate to https://github.com/mulesoft-consulting/flex-gw-cd-examples and click on the **Fork** button in the top-right.
2. Select an owner and specify a name for your repository
3. Click on the **Create fork** button. The new repo is created and you are redirected to the repo homepage.
4. In your fork, within the `develop` branch, edit the `jsonplaceholder.yml` file. Replace the `<your-registration-uuid>` placeholder with the UUID for your registration. This can be obtained from the filenames of your `.conf`, `.key` and `.pem` files which were created when running the registration command.

Now, we can create a GitHub Personal Access Token. ArgoCD will use this token to access your GitHub repo. Create the token by following these steps:
1. In GitHub, navigate to *Settings | Developer Settings | Personal Access Tokens*
2. Click on the **Generate new token** button
3. Specify a note which describes the purpose of the token. Select an expiration period. Select all of the *repo* scopes as shown:\
![alt text](https://github.com/mulesoft-consulting/flex-gw-cd-examples/blob/develop/k8s-ingress-controller/img/1-github-pat.png "GitHub PAT Screenshot")
4. Click on the **Generate token** button at the bottom of the page.
5. The *Personal access tokens* screen is displayed and your token is visible. Make sure to copy it (e.g. to a text editor window) as we will need this later and it will not be visible after you navigate away from this screen!

## Create an ArgoCD Application

The `k8s-ingress-controller` directory within this repository contains example YAML configuration files which describe the *desired state* of the Flex Gateway cluster we created above. We will now create a new application in ArgoCD, which will use these files to configure the cluster.
**TODO: list the files and describe their content here** 

1. In a browser window, navigate to https://localhost:8080. You can choose to ignore any certificate validity warnings and you should reach the login screen. If not, check to ensure that you have the port-forwarding command running as described above.
2. Log in as the `admin` user, using the password you set earlier for this user.
3. Click on the *Settings* icon on the navigation bar on the left of the screen, then click on *Repositories*\
![alt text](https://github.com/mulesoft-consulting/flex-gw-cd-examples/blob/develop/k8s-ingress-controller/img/2-argocd-settings.png "ArgoCD Settings screenshot")
4. In the *Repositories* screen, a message states that no repositories are connected. Click on the **Connect Repo using HTTPS** button.
5. In the dialog, populate the *Type*, *Project*, *Repository URL*, *Username* and *Password* fields as shown below. We don't need to provide a username because we're using a token, so we can just enter `not-used` in the *Username* field. In the *Password* field, paste the GitHub Personal Access Token string which we copied earlier.\
![alt text](https://github.com/mulesoft-consulting/flex-gw-cd-examples/blob/develop/k8s-ingress-controller/img/3-argocd-connect-repo.png "Connect to Repo screenshot")
6. We can use the default values for all other fields. Click on the **Connect** button.
7. The *Repositories* screen is shown again, but this time, the repository connection we just created is listed. Check to make sure that the *Connection Status* is **SUCCESSFUL** as shown below.\
![alt text](https://github.com/mulesoft-consulting/flex-gw-cd-examples/blob/develop/k8s-ingress-controller/img/4-argocd-repos.png "Repos list")
8. Click on the three dots to the right of the *Connection Status* and select *Create Application*.\
![alt text](https://github.com/mulesoft-consulting/flex-gw-cd-examples/blob/develop/k8s-ingress-controller/img/5-argocd-create-app.png "Create app")
9. In the *Create Application* dialog:
- specify an *Application Name* and select the ```default``` project. 
- Set the *Sync Policy* to **Automatic**. 
- In *Sync Options*, select **Auto-create Namespace**. 
- In the *Source* section, specify the ```develop``` branch in the *Revision* field. In the *Path* field, specify ```k8s-ingress-controller```. 
- In the *Destination* section, specify ```https://kubernetes.default.svc``` as the *Cluster URL*. This tells ArgoCD to use the cluster it is running in as the target cluster. Specify ```gateway``` as the *namespace*.
You can also click on a button in the top-right to edit the app configuration as YAML. Here is a snippet showing how it should be configured:
```
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: k8s-ingress-controller-example
spec:
  destination:
    name: ''
    namespace: gateway
    server: 'https://kubernetes.default.svc'
  source:
    path: k8s-ingress-controller
    repoURL: 'https://github.com/colinlennon/flex-gw-cd-examples'
    targetRevision: develop
  project: default
  syncPolicy:
    automated:
      prune: false
      selfHeal: false
    syncOptions:
      - CreateNamespace=true
```
11. Click on the **Create** button.
12. The *Applications* screen is displayed, and the app we just created is shown. Initially, the status is *Missing, OutOfSync, Syncing* because the desired state defined in the GitHub repo does not exist on the target cluster:\
![alt text](https://github.com/mulesoft-consulting/flex-gw-cd-examples/blob/develop/k8s-ingress-controller/img/7-argocd-app-tile.png "app tile")
13. Click on the app name to view further details. The *Current Sync Status* should change to **Synced** and a diagram is displayed depicting the resources which have been configured on the cluster:\
![alt text](https://github.com/mulesoft-consulting/flex-gw-cd-examples/blob/develop/k8s-ingress-controller/img/8-argocd-app-details.png "app details")
14. From a CLI window, run this command to try to access the *jsonplaceholder* microservice via Flex Gateway:
```
curl -v http://localhost/api/users/1
```
You should get a response which includes ```401 Unauthorized``` and a description of what went wrong:
```
*   Trying 127.0.0.1:80...
* Connected to localhost (127.0.0.1) port 80 (#0)
> GET /api/users/1 HTTP/1.1
> Host: localhost
> User-Agent: curl/7.79.1
> Accept: */*
> 
* Mark bundle as not supporting multiuse
< HTTP/1.1 401 Unauthorized
< www-authenticate: Basic realm="mule-realm"
< content-type: application/json; charset=UTF-8
< content-length: 123
< date: Tue, 12 Apr 2022 10:28:38 GMT
< server: Anypoint Flex Gateway
< 
* Connection #0 to host localhost left intact
{"error":"Registered authentication is set to HTTP basic authentication but there was no security context on the session."}
```
This is expected, because our YAML configuration contains the following PolicyBinding:
```
apiVersion: gateway.mulesoft.com/v1alpha1
kind: PolicyBinding
metadata:
  name: ingress-http-auth
spec:
  targetRef:
    name: ingress-http
  policyRef:
    name: http-basic-authentication-flex
  config:
    username: foo
    password: bar
```
15. Try including the username and password from the YAML configuration in the ```curl``` command, like this:
```
curl -u foo:bar -v http://localhost/api/users/1
```
You should receive a response which includes the HTTP response code ```200 OK``` and the following JSON object in the response body:
```
{
  "id": 1,
  "name": "Leanne Graham",
  "username": "Bret",
  "email": "Sincere@april.biz",
  "address": {
    "street": "Kulas Light",
    "suite": "Apt. 556",
    "city": "Gwenborough",
    "zipcode": "92998-3874",
    "geo": {
      "lat": "-37.3159",
      "lng": "81.1496"
    }
  },
  "phone": "1-770-736-8031 x56442",
  "website": "hildegard.org",
  "company": {
    "name": "Romaguera-Crona",
    "catchPhrase": "Multi-layered client-server neural-net",
    "bs": "harness real-time e-markets"
  }
```
16. To observe ArgoCD automatically detecting changes to the deired state and updating the Flex Gateway instance, try changing the username and password within the `PolicyBinding` at the bottom of the `jsonplaceholder.yaml` file. Commit this change to the `develop` branch of your repo. In the ArgoCD user interface, observe the commit being detected and the configuration being updated. You can then test with the old password - 
```
curl -u foo:bar -v http://localhost/api/users/1
```
... and you should receive a ```401 Unauthorized``` response. Now try again, with the new username and password (replace the placeholders in the command below - 
```
curl -u <new-username>:<new-password> -v http://localhost/api/users/1
```
You should receive a response which includes the HTTP response code ```200 OK``` and the same JSON object in the response body as in step 15 above.
