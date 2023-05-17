import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

interface Args {}

export default class NginxIngress extends pulumi.ComponentResource {
	public readonly nginxNamespace: k8s.core.v1.Namespace;
	public readonly nginxIngressController: k8s.helm.v3.Chart;

	constructor(args: Args, opts?: pulumi.ComponentResourceOptions) {
		super("lab:eks-addon", "nginx-ingress-controller", args, opts);

		const generalOpt: pulumi.CustomResourceOptions = { parent: this };

		this.nginxNamespace = new k8s.core.v1.Namespace(
			"nginx-ingress-ns",
			{
				metadata: {
					name: "nginx-ingress-ns",
				},
			},
			{ ...generalOpt }
		);

		this.nginxIngressController = new k8s.helm.v3.Chart(
			"nginx-ingress-controller-helm",
			{
				namespace: this.nginxNamespace.metadata.name,
				chart: "nginx-ingress-controller",
				fetchOpts: {
					repo: "https://charts.bitnami.com/bitnami",
				},
				values: {
					service: {
						type: "LoadBalancer",
						publishService: {
							enabled: true,
						},
						annotations: {
							"service.beta.kubernetes.io/aws-load-balancer-backend-protocol":
								"http",
							"service.beta.kubernetes.io/aws-load-balancer-proxy-protocol":
								"*",
							"service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled":
								"true",
							"service.beta.kubernetes.io/aws-load-balancer-type":
								"nlb",
							"service.beta.kubernetes.io/aws-load-balancer-internal":
								"true",
							"service.beta.kubernetes.io/aws-load-balancer-scheme":
								"internal",
							"service.beta.kubernetes.io/aws-load-balancer-target-group-attributes":
								"preserve_client_ip.enabled=false",
						},
					},
				},
			},
			{ ...generalOpt }
		);
	}
}
