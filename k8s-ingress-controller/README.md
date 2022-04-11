# Kubernetes Ingress Controller

This example shows how a Continuous Delivery solution can be implemented for a Flex Gateway instance installed as a Kubernetes ingress controller, in local mode. In this mode, Flex Gateway is mostly disconnected from the Anypoint control plane and is managed with declarative configuration files.

This example uses [ArgoCD](https://argo-cd.readthedocs.io/en/stable/), a declarative, GitOps continuous delivery tool for Kubernetes. Configuration files which describe the *desired state* of the target cluster are stored within a GitHub repository. ArgoCD polls the repository in order to detect when the desired state has changed and applies changes to the target cluster in order to ensure that its *actual state* matches the desired state.

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

For simplicity, ArgoCD is installed in the same cluster as Flex Gateway in this example. Depending on your real-world requirements, you may wish to install ArgoCD in a separate cluster.

TBC...

## Configure ArgoCD

TBC...
