import { Input } from "@pulumi/pulumi";
import * as dotenv from "dotenv";
import * as aws from "@pulumi/aws";

dotenv.config();

interface IConfig {
	aws: {
		accessKey: string;
		secretKey: string;
		region: Input<aws.Region>;
		accountId: string
	};
}

const config: IConfig = {
	aws: {
		accessKey: process.env.AWS_ACCESS_KEY || "unkwon_AWS_ACCESS_KEY",
		secretKey: process.env.AWS_secret_key || "unkwon_AWS_secret_key",
		region: "ap-southeast-1",
		accountId: "608671652196"
	},
};

export default config;
