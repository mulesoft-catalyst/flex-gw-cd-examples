# Using a Secrets Vault with ArgoCD

This example, which is based on the [Flex Gateway deployed as a Kubernetes sidecar in local mode](../k8s-sidecar/README.md) example, shows how a secrets vault can be used to store and manage secrets securely, and how ArgoCD can retrieve them and inject them into Kubernetes resources. 

This example uses [ArgoCD](https://argo-cd.readthedocs.io/en/stable/), a declarative, GitOps continuous delivery tool for Kubernetes. Configuration files which describe the *desired state* of the target cluster are stored within a GitHub repository. ArgoCD polls the repository in order to detect when the desired state has changed and applies changes to the target cluster in order to ensure that its *actual state* matches the desired state.

The [ArgoCD Vault Plugin](https://github.com/argoproj-labs/argocd-vault-plugin) is used in this example. To demonstrate how it can be used within the context of Flex Gateway, the [sidecar example](../k8s-sidecar/README.md) has been modified. The `ApiInstance` (defined within `configmap.yaml`) has been updated to apply the HTTP Basic Authentication policy (`http-basic-authentication-flex`). The key points to note in `configmap.yaml` are:

1. The `avp.kubernetes.io/path` annotation, which tells the ArgoCD Vault Plugin that this YAML file contains a secret placeholder and provides the path to the relevant secret in the secrets vault
1. The value of the `password` attribute being a placeholder, indicated by the use of angle brackets `<>`

HashiCorp Vault is used in this example. The ArgoCD Vault Plugin supports other secrets vaults including AWS Secrets Manager, GCP Secrets Manager and Azure Key Vault.

**Note: the steps below are correct at time of writing. Please refer to the Flex Gateway documentation for up-to-date instructions on installing and configuring Flex Gateway:**
[Flex Gateway Docs](https://docs.mulesoft.com/gateway/flex-gateway-overview)

## Pre-requisites

1. A tool to create Kubernetes clusters. This example was developed using [k3d](https://k3d.io/).
2. [kubectl](https://kubernetes.io/docs/tasks/tools/#kubectl), a tool used to interact with Kubernetes clusters.
3. [Helm](https://helm.sh/docs/intro/install/), a tool used to install Flex Gateway. Version 3.0.0 or later is required.
4. [Docker](https://docs.docker.com/get-docker/), required to register a Flex Gateway instance using the `flexctl` command.
5. Vault CLI. Can be installed on MacOS via Homebrew: `brew install vault`.

## Prepare Your Environment

1. Create a new Kubernetes cluster with a single server node. 
2. Pull the Flex Gateway container image from Docker Hub:

Refer to the [Flex Gateway deployed as a Kubernetes sidecar in local mode](../k8s-sidecar/README.md) example for details.

## Run the Registration Command

**Please refer to the [official docs](https://docs.mulesoft.com/gateway/flex-local-reg-run) for up-to-date instructions on how to run the registration command.**

You can register Flex Gateway using a username and password, a connected app or a token. In this example, we will use a username and password. Refer to the [Flex Gateway deployed as a Kubernetes sidecar in local mode](../k8s-sidecar/README.md) example for details.

## Run the Installation Commands

Follow the instructions [here](https://docs.mulesoft.com/gateway/flex-local-reg-run-up#install-helm-chart-into-the-namespace).

---
**IMPORTANT!**\
When installing the Helm chart, it is necessary to modify the command provided in the docs.
The command provided in the docs uses the name **ingress** for the Helm release. However, in this case, we are not installing Flex as an ingress controller. So instead of using **ingress** as the name, use **gateway**. The `clusterrolebindings.yaml` file in this example is populated based on the assumption that **gateway** is used as the Helm release name. If you use something else, you will need to update this file manually in your forked repo accordingly.

Here is an example of the command, with **gateway** used as the name:
```
helm -n gateway upgrade -i --wait gateway flex-gateway/flex-gateway \
--set registerSecretName=<UUID-of-your-file> \
--set service.enabled=false
```
---

## Install and Configure Vault

1. Add the Helm repo:
```
helm repo add hashicorp https://helm.releases.hashicorp.com
```
2. Install Vault in dev mode:
```
helm install vault hashicorp/vault \
--set "server.dev.enabled=true"
```
(Note: Dev mode is ideal for learning and demonstration environments but NOT recommended for a production environment)
3. Enable the AppRole auth method:
```
kubectl exec vault-0 -- vault auth enable approle
```
4. Expose the user interface by running this command in a separate CLI:
```
kubectl port-forward vault-0 8200:8200
```
5. Create a token and copy the value listed for the `token` key:
```
kubectl exec vault-0 -- vault token create
```
Now you can log in using this token, at `http://localhost:8200/`. You can see that a key/value Secrets Engine called `secret` is created by default. We will use this.\
6. Set an environment variable so that the Vault CLI can connect to Vault:
```
export VAULT_ADDR=http://localhost:8200/
```
7. Log in via the CLI and provide the token when prompted:
```
vault login
```
8. Create a policy file locally called `readonly.hcl` with the content below:
```
path "secret/data/*" {
  capabilities = ["read"]
}
```
9. Create the policy in Vault by running this command:
```
vault policy write readonly readonly.hcl
```
10. Enable the `approle` auth method:
```
auth enable approle
```
11. Create a new `approle` and link it to the `readonly` policy:
```
vault write auth/approle/role/demo-role \
secret_id_ttl=24h \
token_num_uses=100 \
token_ttl=20m \
token_max_ttl=30m \
secret_id_num_uses=100 \
policies="readonly"
```
12. Get the `role-id` for the role and make a note of this (we will need it later):
```
vault read auth/approle/role/demo-role/role-id
```
13. Get the `secret-id` for the role and make a note of this (we will need it later):
```
vault write -f auth/approle/role/demo-role/secret-id
```
14. Create a new secret, with a `password` key:
```
vault kv put secret/jsonplaceholder password=welcome123
```

## Create Kubernetes Secret for ArgoCD Vault Plugin
The ArgoCD Vault Plugin will connect to your Vault instance to retrieve secrets. To enable this, we will create a Kubernetes Secret called `argocd-vault-plugin-credentials`in the `argocd` namespace, in which we will define some key-value pairs. These will be mounted as environment variables in the `argocd-repo-server` deployment.

First, execute `kubectl get service vault -o yaml` and get the `ClusterIP` value. We will use this in the next step. Then create a file called `secret.yaml` with the content below. Replace the placeholder values for `AVP_ROLE_ID`, `AVP_SECRET_ID` and `VAULT_ADDR` with the values obtained in the previous steps.
```
kind: Secret
apiVersion: v1
metadata:
  name: argocd-vault-plugin-credentials
  namespace: argocd
type: Opaque
stringData:
  AVP_AUTH_TYPE: approle
  AVP_ROLE_ID: <role-id-obtained-previously>
  AVP_SECRET_ID: <secret-id-obtained-previously>
  AVP_TYPE: vault
  VAULT_ADDR: http://<ClusterIP-obtained-previously>:8200
```
Create the secret by running `kubectl apply -f secret.yaml -n argocd`. 

## Install ArgoCD

For simplicity, ArgoCD is installed in the same cluster as Flex Gateway in this example. It is accessed from outside of the cluster using port forwarding. In practice, you may wish to install ArgoCD in a separate cluster, expose it using an ingress controller such as NGINX and use it to manage one or more Flex Gateway clusters.

**Note: the steps below are correct at time of writing, based on the [ArgoCD Getting Started docs](https://argo-cd.readthedocs.io/en/stable/getting_started/). Please refer to these docs for up-to-date instructions on installing ArgoCD.**

Refer to the [Flex Gateway deployed as a Kubernetes sidecar in local mode](../k8s-sidecar/README.md) example for details.

## Add ArgoCD Vault Plugin

Now, we need to add the ArgoCD Vault Plugin to our ArgoCD instance. In this section, we will modify some Kubernetes resources which were created when we installed ArgoCD in the previous step, using `kubectl` to obtain the resource definitions and to apply the updated definitions.

First, we need to download the plugin and register it with ArgoCD. To do this, we need to modify the `argocd-repo-server` deployment:

```
containers:
- name: argocd-repo-server
  volumeMounts:
  - name: custom-tools
    mountPath: /usr/local/bin/argocd-vault-plugin
    subPath: argocd-vault-plugin
volumes:
- name: custom-tools
  emptyDir: {}
initContainers:
- name: download-tools
  image: alpine:3.8
  command: [sh, -c]
  args:
    - wget -O argocd-vault-plugin
      https://github.com/argoproj-labs/argocd-vault-plugin/releases/download/v1.6.0/argocd-vault-plugin_1.6.0_linux_amd64

      chmod +x argocd-vault-plugin &&\
      mv argocd-vault-plugin /custom-tools/
  volumeMounts:
    - mountPath: /custom-tools
      name: custom-tools
```
 
Here, we are creating a blank volume called `custom-tools` to be used for moving the argocd-vault-plugin binary from the initContainer to the main container. Then we are downloading the argocd-vault-plugin binary via an InitContainer and then moving the binary to a path `custom-tools` that will be used later. We then have a Volume Mount on that `custom-tools` path so that we can access it in the main container. Now in the argocd-repo-server container, we are adding a Volume Mount that points to the `custom-tools` volume we created earlier and mounting that volume within `usr/local/bin` to make the plugin available to the container. At this point, we can test that the plugin is available by running `argocd-vault-plugin` on the `argocd-repo-server` pod (e.g. using `kubectl exec`).

The next step is to register the plugin with ArgoCD itself. There is a configMap called `argocd-cm`. All that is required to to go to that configMap and add:
```
data:
  configManagementPlugins: |-
    - name: argocd-vault-plugin
      generate:
        command: ["sh", "-c"]
        args: ["argocd-vault-plugin generate ./"]
```

Now, we mount the `argocd-vault-plugin-credentials` Kubernetes Secret we created earlier as environment variables within the `argocd-repo-server` deployment. This enables the ArgoCD Vault Plugin to connect to our Vault instance to retrieve secrets. To do this, first retrieve the current config of the `argocd-repo-server` deployment:
```
kubectl get deployment argocd-repo-server -n argocd -o yaml > argocd-repo-server.yaml
```
Then edit the `argocd-repo-server.yaml` file. Add an `envFrom` to the `argocd-repo-server` container, as shown in this snippet:
```
containers:
- name: argocd-repo-server
  envFrom:
    - secretRef:
        name: argocd-vault-plugin-credentials
```
This mounts the key-value pairs defined in the `argocd-vault-plugin-credentials` secret as environment variables. Each key becomes an environment variable name in the Pod. Apply these changes via `kubectl appy`. 

Restart the `argocd-repo-server` deployment:
```
kubectl rollout restart deployment/argocd-repo-server -n argocd

```
Then in the ArgoCD UI, open the Create Application dialog. In the bottom section, change the dropdown value from Directory to Plugin, then verify that `argocd-vault-plugin` is available in the Name dropdown. You can also verify that the environment variables have been mounted by getting the name of the `argocd-repo-server` pod, then running:
```
kubectl exec <pod-name> -n argocd -- env
```
Check that all of the key-value pairs from the `argocd-vault-plugin-credentials` secret have been mounted as environment variables.

## Create a source code repository
The `k8s-sidecar-with-vault` directory within this repository contains example YAML configuration files which describe the *desired state* of the Flex Gateway cluster we created above. We will create a new application in ArgoCD, which will use these files to configure the cluster. Before we can do this, we need to create a source code repository which the ArgoCD application will connect to. In this example, we **fork** this GitHub repo, then configure ArgoCD to connect to it. ArgoCD can be configured to connect to other Git-based SCMs too - please refer to the docs if needed. 

Refer to the [Flex Gateway deployed as a Kubernetes sidecar in local mode](../k8s-sidecar/README.md) example for details.

## Create an ArgoCD Application

We will now create a new application in ArgoCD, which will use the configuration files in the source code repository we've just created (the fork of this repository) to configure the cluster.
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
10. Near the bottom of the dialog, change the final dropdown from *Directory* to *Plugin*. In the Name dropdown, select `argocd-vault-plugin`. 
11. Click on the **Create** button.
12. The *Applications* screen is displayed, and the app we just created is shown. Initially, the status is *Missing, OutOfSync, Syncing* because the desired state defined in the GitHub repo does not exist on the target cluster:\
![alt text](https://github.com/mulesoft-consulting/flex-gw-cd-examples/blob/develop/k8s-ingress-controller/img/7-argocd-app-tile.png "app tile")
13. Click on the app name to view further details. The *Current Sync Status* should change to **Synced** and a diagram is displayed depicting the resources which have been configured on the cluster:\
![alt text](https://github.com/mulesoft-consulting/flex-gw-cd-examples/blob/develop/k8s-ingress-controller/img/8-argocd-app-details.png "app details")
14. From a CLI window, run this command to try to access the *jsonplaceholder* microservice via Flex Gateway:
```
curl -v http://localhost:8082/users
```
You should get a `401 Unauthorized` response with this message:
```
{"error":"Registered authentication is set to HTTP basic authentication but there was no security context on the session."}
```
Now, try specifying the username along with an incorrect password:
```
curl -v http://localhost:8082/users/ -u "testuser:welcome"
```
You should get a `401 Unauthorized` response with this message:
```
{"error":"Authentication Attempt Failed"}
```
Finally, try specifying the username along with the correct password:
```
curl -v http://localhost:8082/users/ -u "testuser:welcome123"
```
You should get a `200 OK` response and a JSON object with a list of users.